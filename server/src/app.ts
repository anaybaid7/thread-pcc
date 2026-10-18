import { advance, decide, EngineError, getScenario, handoverFacts, node, submitHandover } from '@thread/engine'
import Fastify, { type FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { describeError, isConnectionError, type Db } from './db'
import type { GeminiDrafter } from './gemini'
import { migrate, seed } from './migrate'
import {
  attemptLog,
  command,
  Conflict,
  countDrafts,
  createAttempt,
  listAttempts,
  listScenarios,
  loadAttempt,
  NotFound,
  present,
  saveDraft,
  writeDecision,
  writeHandover,
} from './repo'

const Tag = z.enum(['observed', 'assumption', 'unknown'])
const Section = z.object({ text: z.string().max(1200), factIds: z.array(z.string().max(40)).max(50) })
const Draft = z.object({ situation: Section, background: Section, assessment: Section, recommendation: Section, unknowns: z.array(Section).max(10) })

const Bodies = {
  create: z.object({ scenarioId: z.string().max(60), course: z.string().max(40).optional() }),
  advance: z.object({ revision: z.number().int().min(0) }),
  decide: z.object({
    revision: z.number().int().min(0),
    decisionId: z.string().max(60),
    recognition: z.array(z.string().max(40)).max(10),
    tags: z.record(z.string().max(40), Tag),
    choice: z.string().max(60),
  }),
  draft: z.object({ factIds: z.array(z.string().max(40)).max(100).optional() }),
  submit: z.object({ revision: z.number().int().min(0), draft: Draft, startedFrom: z.enum(['gemini', 'template', 'blank']) }),
  replay: z.object({ course: z.enum(['same', 'other']).default('same') }),
}

export interface Deps {
  db: Db
  gemini: GeminiDrafter
  logger?: boolean
}

export function buildApp({ db, gemini, logger = false }: Deps): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 })

  // Migrate and seed once; if the database is down at start, try again on the next request.
  let ready: Promise<void> | null = null
  const ensureReady = () => {
    ready ??= (async () => {
      await migrate(db)
      await seed(db)
    })().catch((e) => {
      ready = null
      throw e
    })
    return ready
  }
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/') && req.url !== '/api/health') await ensureReady()
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid_request', message: 'The request was not in the expected shape.' })
    if (err instanceof EngineError) return reply.code(err.code === 'invalid' ? 400 : 409).send({ error: err.code, message: err.message })
    if (err instanceof NotFound) return reply.code(404).send({ error: 'not_found', message: err.message })
    if (err instanceof Conflict) return reply.code(409).send({ error: 'conflict', message: err.message })
    if (isConnectionError(err)) {
      req.log.warn({ reason: describeError(err) }, 'database unavailable')
      return reply.code(503).send({
        error: 'database_unavailable',
        message: `The database is unavailable (${describeError(err)}). Nothing was saved.`,
      })
    }
    const status = (err as { statusCode?: number }).statusCode
    if (status && status < 500) return reply.code(status).send({ error: 'bad_request', message: (err as Error).message })
    req.log.error({ reason: describeError(err), message: (err as Error).message }, 'request failed')
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong. Nothing was saved.' })
  })

  app.get('/api/health', async (_req, reply) => {
    const t0 = performance.now()
    try {
      await db.query('select 1')
      let schema: string | null = null
      try {
        await ensureReady()
        schema = (await db.query<{ v: string }>('select max(version) as v from schema_migrations')).rows[0]?.v ?? null
      } catch (e) {
        if (isConnectionError(e)) throw e
        return reply.code(503).send({
          status: 'degraded',
          database: { ok: false, provider: db.info.provider, target: db.info.target, error: `migrations failed: ${describeError(e)}` },
          gemini: gemini.status(),
        })
      }
      return {
        status: 'ok',
        database: { ok: true, provider: db.info.provider, target: db.info.target, latencyMs: Math.round(performance.now() - t0), schema },
        gemini: gemini.status(),
      }
    } catch (e) {
      return reply.code(503).send({
        status: 'degraded',
        database: { ok: false, provider: db.info.provider, target: db.info.target, error: describeError(e) },
        gemini: gemini.status(),
      })
    }
  })

  app.get('/api/scenarios', async () => ({
    scenarios: (await listScenarios(db)).map((s) => ({ id: s.id, version: s.version, title: s.title, subtitle: s.subtitle, blurb: s.blurb })),
  }))

  app.get('/api/attempts', async () => ({ attempts: await listAttempts(db) }))

  app.post('/api/attempts', async (req, reply) => {
    const body = Bodies.create.parse(req.body)
    if (!getScenario(body.scenarioId)) throw new NotFound(`No scenario "${body.scenarioId}"`)
    reply.code(201)
    return present(await createAttempt(db, body.scenarioId, body.course))
  })

  app.get<{ Params: { id: string } }>('/api/attempts/:id', async (req) => present(await loadAttempt(db, req.params.id)))

  app.get<{ Params: { id: string } }>('/api/attempts/:id/log', async (req) => {
    await loadAttempt(db, req.params.id)
    return { log: await attemptLog(db, req.params.id) }
  })

  app.post<{ Params: { id: string } }>('/api/attempts/:id/advance', async (req) => {
    const { revision } = Bodies.advance.parse(req.body)
    return present(
      await command(db, req.params.id, revision, (s, st) => {
        const r = advance(s, st)
        return { state: r.state, log: [{ type: 'event_revealed', eventKey: r.event.id, payload: { phase: r.state.phase } }] }
      }),
    )
  })

  app.post<{ Params: { id: string } }>('/api/attempts/:id/decisions', async (req) => {
    const b = Bodies.decide.parse(req.body)
    return present(
      await command(db, req.params.id, b.revision, (s, st) => {
        const r = decide(s, st, b.decisionId, { recognition: b.recognition, tags: b.tags, choice: b.choice })
        return {
          state: r.state,
          log: [{ type: 'decision_made', eventKey: r.record.decisionId, payload: { choice: r.record.input.choice, evidence: r.record.evidence } }],
          write: (q, id) => writeDecision(q, id, r.record),
        }
      }),
    )
  })

  app.post<{ Params: { id: string } }>('/api/attempts/:id/handover/draft', async (req) => {
    const b = Bodies.draft.parse(req.body ?? {})
    const { row, scenario } = await loadAttempt(db, req.params.id)
    const st = row.state
    if (st.phase !== 'handover') throw new EngineError('not_now', 'The handover is not open yet')
    const spec = node(scenario, st.nodeId).handover!
    const facts = handoverFacts(scenario, st)
    const known = new Set(facts.map((f) => f.id))
    const selected = b.factIds?.filter((id) => known.has(id))
    const result = await gemini.draft(scenario, st, facts, spec, { selected, draftsSoFar: await countDrafts(db, row.id, 'gemini') })
    const draftId = await saveDraft(db, row.id, { ...result, facts })
    return { draftId, ...result, saved: true }
  })

  app.post<{ Params: { id: string } }>('/api/attempts/:id/handover', async (req) => {
    const b = Bodies.submit.parse(req.body)
    return present(
      await command(db, req.params.id, b.revision, (s, st) => {
        const facts = handoverFacts(s, st)
        const r = submitHandover(s, st, b.draft, b.startedFrom)
        return {
          state: r.state,
          log: [{ type: 'handover_submitted', payload: { startedFrom: b.startedFrom } }],
          write: (q, id) => writeHandover(q, id, s, r.state, r.record, facts),
        }
      }),
    )
  })

  app.post<{ Params: { id: string } }>('/api/attempts/:id/replay', async (req, reply) => {
    const b = Bodies.replay.parse(req.body ?? {})
    const { row, scenario } = await loadAttempt(db, req.params.id)
    const course = b.course === 'same' ? row.course : (scenario.courses.find((c) => c.id !== row.course)?.id ?? row.course)
    reply.code(201)
    return present(await createAttempt(db, scenario.id, course, row.id))
  })

  return app
}
