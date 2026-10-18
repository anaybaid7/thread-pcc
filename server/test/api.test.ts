import { evelyn, templateDraft, type AttemptState, type AttemptView } from '@thread/engine'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { readConfig } from '../src/config'
import { openDb, type Db } from '../src/db'
import { GeminiDrafter } from '../src/gemini'
import { migrate, seed } from '../src/migrate'

type Res = { attempt: { id: string; revision: number; replayOf: string | null }; view: AttemptView }

let db: Db
let app: FastifyInstance

beforeAll(async () => {
  db = await openDb({ kind: 'pglite', dir: null })
  // No key: drafts must fall back to the template.
  app = buildApp({ db, gemini: new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }) })
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await db.close()
})

async function post<T = Res>(url: string, payload: unknown = {}, expectStatus?: number) {
  const r = await app.inject({ method: 'POST', url, payload: payload as object })
  if (expectStatus) expect(r.statusCode, r.body).toBe(expectStatus)
  else expect(r.statusCode, r.body).toBeLessThan(300)
  return r.json() as T
}

async function get<T = Res>(url: string) {
  const r = await app.inject({ method: 'GET', url })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as T
}

/** Advance until a decision or the handover is waiting. */
async function runToStop(res: Res): Promise<Res> {
  let cur = res
  while (cur.view.canAdvance) cur = await post(`/api/attempts/${cur.attempt.id}/advance`, { revision: cur.attempt.revision })
  return cur
}

async function decideBest(res: Res): Promise<Res> {
  const d = res.view.decision!
  const dp = Object.values(evelyn.nodes).find((n) => n.decision?.id === d.id)!.decision!
  const r = dp.recognition
  return post(`/api/attempts/${res.attempt.id}/decisions`, {
    revision: res.attempt.revision,
    decisionId: d.id,
    recognition: r.kind === 'dimensions' ? r.options.filter((o) => o.changed).map((o) => o.id) : [[...r.options].sort((a, b) => b.points - a.points)[0]!.id],
    tags: Object.fromEntries(dp.statements.map((x) => [x.id, x.answer])),
    choice: [...dp.choices].sort((a, b) => b.communication - a.communication)[0]!.id,
  })
}

describe('schema', () => {
  it('migrations and seed are idempotent', async () => {
    await migrate(db)
    expect(await migrate(db)).toEqual([])
    await seed(db)
    expect(await seed(db)).toEqual([])
    const counts = (
      await db.query<{ v: number; p: number; e: number }>(
        `select (select count(*)::int from scenario_versions) v, (select count(*)::int from resident_profiles) p, (select count(*)::int from scenario_events) e`,
      )
    ).rows[0]!
    expect(counts.v).toBe(1)
    expect(counts.p).toBe(1)
    expect(counts.e).toBeGreaterThan(20)
  })

  it('refuses to silently change a seeded scenario version', async () => {
    await expect(seed(db, [{ ...evelyn, title: 'Changed' }])).rejects.toThrow(/Bump its version/)
  })

  it('stores residents as synthetic only', async () => {
    const rows = (await db.query<{ synthetic: boolean }>('select synthetic from resident_profiles')).rows
    expect(rows.every((r) => r.synthetic)).toBe(true)
  })
})

describe('health', () => {
  it('reports the database and Gemini status', async () => {
    const h = await get<{ status: string; database: { ok: boolean; provider: string; schema: string }; gemini: { configured: boolean } }>('/api/health')
    expect(h.status).toBe('ok')
    expect(h.database).toMatchObject({ ok: true, provider: 'pglite', schema: '001_init.sql' })
    expect(h.gemini.configured).toBe(false)
  })
})

describe('a full attempt, persisted', () => {
  let finished: Res

  it('plays Evelyn end to end, saving each step', async () => {
    let res = await post('/api/attempts', { scenarioId: 'evelyn' }, 201)
    expect(res.view.phase).toBe('prebrief')
    res = await runToStop(res)
    expect(res.view.phase).toBe('decision')
    expect(JSON.stringify(res.view.decision)).not.toMatch(/"answer"/)

    res = await decideBest(res)
    expect(res.view.feedback!.lines).toHaveLength(3)
    // The decision row records exactly the evidence available at the time.
    const d = (await db.query<{ evidence_event_keys: string[]; choice_key: string }>('select * from player_decisions where attempt_id = $1', [res.attempt.id])).rows[0]!
    expect(d.choice_key).toBe('tell')
    expect(d.evidence_event_keys).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])

    res = await runToStop(res)
    res = await decideBest(res)
    res = await runToStop(res)
    expect(res.view.phase).toBe('handover')

    const draft = await post<{ source: string; fallbackReason: string; draft: ReturnType<typeof templateDraft>; saved: boolean }>(
      `/api/attempts/${res.attempt.id}/handover/draft`,
    )
    expect(draft.source).toBe('template')
    expect(draft.fallbackReason).toMatch(/not configured/)
    expect(draft.saved).toBe(true)

    res = await post(`/api/attempts/${res.attempt.id}/handover`, { revision: res.attempt.revision, draft: draft.draft, startedFrom: 'template' })
    expect(res.view.phase).toBe('complete')
    expect(res.view.debrief!.total).toBe(100)
    expect(res.view.debrief!.course.id).toBe('persist')
    finished = res

    const rows = (
      await db.query<{ scores: number; drafts: number; debriefs: number; total: number }>(
        `select (select count(*)::int from decision_scores where attempt_id = $1) scores,
                (select count(*)::int from handover_drafts where attempt_id = $1) drafts,
                (select count(*)::int from debrief_results where attempt_id = $1) debriefs,
                (select total_score from simulation_attempts where id = $1) total`,
        [res.attempt.id],
      )
    ).rows[0]!
    expect(rows).toEqual({ scores: 11, drafts: 2, debriefs: 1, total: 100 })

    const log = await get<{ log: { type: string }[] }>(`/api/attempts/${res.attempt.id}/log`)
    expect(log.log[0]!.type).toBe('started')
    expect(log.log.at(-1)!.type).toBe('handover_submitted')
  })

  it('a completed attempt is immutable', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/attempts/${finished.attempt.id}/advance`, payload: { revision: finished.attempt.revision } })
    expect(r.statusCode).toBe(409)
  })

  it('replay creates a separate attempt and leaves the original untouched', async () => {
    const before = await get(`/api/attempts/${finished.attempt.id}`)
    const replay = await post(`/api/attempts/${finished.attempt.id}/replay`, { course: 'other' }, 201)
    expect(replay.attempt.id).not.toBe(finished.attempt.id)
    expect(replay.attempt.replayOf).toBe(finished.attempt.id)
    expect(replay.view.phase).toBe('prebrief')
    let r = await runToStop(replay)
    r = await decideBest(r)
    r = await runToStop(r)
    expect(r.view.timeline.some((t) => t.type === 'event' && t.id === 'tr5')).toBe(true) // the other course
    const after = await get(`/api/attempts/${finished.attempt.id}`)
    expect(after).toEqual(before)
    const list = await get<{ attempts: { id: string; course: string | null }[] }>('/api/attempts')
    expect(list.attempts.find((a) => a.id === replay.attempt.id)!.course).toBeNull() // not revealed until complete
  })
})

describe('errors are explicit', () => {
  it('rejects a stale revision instead of overwriting', async () => {
    const res = await post('/api/attempts', { scenarioId: 'evelyn' }, 201)
    await post(`/api/attempts/${res.attempt.id}/advance`, { revision: 0 })
    const r = await app.inject({ method: 'POST', url: `/api/attempts/${res.attempt.id}/advance`, payload: { revision: 0 } })
    expect(r.statusCode).toBe(409)
    expect(r.json().message).toMatch(/another tab/)
  })

  it('rejects decisions made before the decision point', async () => {
    const res = await post('/api/attempts', { scenarioId: 'evelyn' }, 201)
    const r = await app.inject({
      method: 'POST',
      url: `/api/attempts/${res.attempt.id}/decisions`,
      payload: { revision: 0, decisionId: 'd1', recognition: [], tags: {}, choice: 'tell' },
    })
    expect(r.statusCode).toBe(409)
    const state = (await db.query<{ state: AttemptState }>('select state from simulation_attempts where id = $1', [res.attempt.id])).rows[0]!.state
    expect(state.decisions).toHaveLength(0)
  })

  it('validates input', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/attempts', payload: { scenarioId: 42 } })
    expect(r.statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: '/api/attempts/not-an-id' })).statusCode).toBe(404)
  })

  it('returns 503, not success, when the database is unavailable', async () => {
    const broken: Db = {
      info: { provider: 'postgres', target: 'db.example:5432' },
      query: async () => {
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      },
      exec: async () => {
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      },
      tx: async () => {
        throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
      },
      close: async () => {},
    }
    const down = buildApp({ db: broken, gemini: new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }) })
    const h = await down.inject({ method: 'GET', url: '/api/health' })
    expect(h.statusCode).toBe(503)
    expect(h.json().database).toMatchObject({ ok: false, error: 'connection refused' })
    const c = await down.inject({ method: 'POST', url: '/api/attempts', payload: { scenarioId: 'evelyn' } })
    expect(c.statusCode).toBe(503)
    expect(c.json().message).toMatch(/Nothing was saved/)
    await down.close()
  })
})
