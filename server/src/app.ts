import { AREAS, MEASURES, WardError } from '@thread/engine'
import Fastify, { type FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { describeError, isConnectionError, type Db } from './db'
import type { GeminiDrafter } from './gemini'
import { migrate } from './migrate'
import { Conflict, createWorkspace, loadWorkspace, NotFound, saveSbar, send } from './repo'

const Area = z.enum(Object.keys(AREAS) as [keyof typeof AREAS, ...(keyof typeof AREAS)[]])
const Kind = z.enum(Object.keys(MEASURES) as [keyof typeof MEASURES, ...(keyof typeof MEASURES)[]])
const Id = z.string().min(1).max(60)
const Sbar = z.object({ situation: z.string().max(1200), background: z.string().max(1200), assessment: z.string().max(1600), recommendation: z.string().max(800), source: z.enum(['gemini', 'template', 'edited']) })

const Command = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('checkin'),
    by: Id,
    residentId: Id,
    findings: z.array(z.object({ area: Area, status: z.enum(['usual', 'different', 'unchecked']), finding: z.string().max(160).optional() })).max(12),
    quote: z.string().max(200).optional(),
  }),
  z.object({ type: z.literal('measure'), by: Id, residentId: Id, kind: Kind, value: z.union([z.number(), z.string().max(40)]) }),
  z.object({ type: z.literal('plan'), by: Id, concernId: Id, decision: z.enum(['watch', 'escalate']), recheckIn: z.number().int(), recheck: z.array(Area).max(8), to: Id.optional(), sbar: Sbar.optional() }),
  z.object({ type: z.literal('open'), by: Id, residentId: Id, reason: z.string().max(200) }),
  z.object({ type: z.literal('resolve'), by: Id, concernId: Id }),
  z.object({ type: z.literal('ack'), by: Id, key: z.string().max(80) }),
  z.object({ type: z.literal('advance'), to: z.number().int() }),
])

export interface Deps {
  db: Db
  gemini: GeminiDrafter
  logger?: boolean
}

export function buildApp({ db, gemini, logger = false }: Deps): FastifyInstance {
  const app = Fastify({ logger, bodyLimit: 64 * 1024 })

  let ready: Promise<unknown> | null = null
  const ensureReady = () => {
    ready ??= migrate(db).catch((e) => {
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
    if (err instanceof WardError) return reply.code(400).send({ error: 'invalid', message: err.message })
    if (err instanceof NotFound) return reply.code(404).send({ error: 'not_found', message: err.message })
    if (err instanceof Conflict) return reply.code(409).send({ error: 'conflict', message: err.message })
    if (isConnectionError(err)) {
      req.log.warn({ reason: describeError(err) }, 'database unavailable')
      return reply.code(503).send({ error: 'database_unavailable', message: `The database is unavailable (${describeError(err)}). Nothing was saved.` })
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
      try {
        await ensureReady()
      } catch (e) {
        if (isConnectionError(e)) throw e
        return reply.code(503).send({ status: 'degraded', database: { ok: false, provider: db.info.provider, target: db.info.target, error: `migrations failed: ${describeError(e)}` }, gemini: gemini.status() })
      }
      const schema = (await db.query<{ v: string }>('select max(version) as v from schema_migrations')).rows[0]?.v ?? null
      return { status: 'ok', database: { ok: true, provider: db.info.provider, target: db.info.target, latencyMs: Math.round(performance.now() - t0), schema }, gemini: gemini.status() }
    } catch (e) {
      return reply.code(503).send({ status: 'degraded', database: { ok: false, provider: db.info.provider, target: db.info.target, error: describeError(e) }, gemini: gemini.status() })
    }
  })

  app.post('/api/workspaces', async (_req, reply) => {
    reply.code(201)
    return createWorkspace(db)
  })

  app.get<{ Params: { id: string } }>('/api/workspaces/:id', async (req) => loadWorkspace(db, req.params.id))

  app.post<{ Params: { id: string } }>('/api/workspaces/:id/commands', async (req) => {
    const b = z.object({ seq: z.number().int().min(0), command: Command }).parse(req.body)
    return send(db, req.params.id, b.seq, b.command)
  })

  app.post<{ Params: { id: string } }>('/api/workspaces/:id/sbar', async (req) => {
    const { concernId } = z.object({ concernId: Id }).parse(req.body)
    const w = await loadWorkspace(db, req.params.id)
    const result = await gemini.draft(w.ward, concernId)
    await saveSbar(db, w.id, concernId, result)
    return result
  })

  return app
}
