import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { readConfig } from '../src/config'
import { openDb, type Db } from '../src/db'
import { GeminiDrafter } from '../src/gemini'

/**
 * Runs only when TEST_DATABASE_URL points at a real PostgreSQL server (CI starts one as a service container; point it
 * at a Vultr test database to check that too). It drops and recreates THREAD's tables, so never aim it at real data.
 */
const url = process.env.TEST_DATABASE_URL
const TABLES = [
  'debrief_results',
  'decision_scores',
  'handover_drafts',
  'player_decisions',
  'attempt_events',
  'simulation_attempts',
  'scenario_events',
  'resident_profiles',
  'scenario_versions',
  'scenarios',
  'schema_migrations',
]

describe.skipIf(!url)('real PostgreSQL server', () => {
  let db: Db
  beforeAll(async () => {
    db = await openDb(readConfig({ DATABASE_URL: url }).database)
    await db.exec(TABLES.map((t) => `drop table if exists ${t} cascade;`).join('\n'))
  })
  afterAll(async () => db?.close())

  it('migrates, seeds, saves a decision and replays without touching the original', async () => {
    const app = buildApp({ db, gemini: new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }) })
    const h = (await app.inject({ method: 'GET', url: '/api/health' })).json()
    expect(h.database).toMatchObject({ ok: true, schema: '001_init.sql' })
    let res = (await app.inject({ method: 'POST', url: '/api/attempts', payload: { scenarioId: 'evelyn' } })).json()
    while (res.view.canAdvance)
      res = (await app.inject({ method: 'POST', url: `/api/attempts/${res.attempt.id}/advance`, payload: { revision: res.attempt.revision } })).json()
    const r = await app.inject({
      method: 'POST',
      url: `/api/attempts/${res.attempt.id}/decisions`,
      payload: {
        revision: res.attempt.revision,
        decisionId: 'd1',
        recognition: ['intake', 'mobility', 'engagement'],
        tags: { s1: 'observed', s2: 'observed', s3: 'assumption', s4: 'unknown', s5: 'unknown' },
        choice: 'tell',
      },
    })
    expect(r.statusCode, r.body).toBe(200)
    const before = (await app.inject({ method: 'GET', url: `/api/attempts/${res.attempt.id}` })).json()
    const replay = await app.inject({ method: 'POST', url: `/api/attempts/${res.attempt.id}/replay`, payload: { course: 'other' } })
    expect(replay.statusCode).toBe(201)
    expect((await app.inject({ method: 'GET', url: `/api/attempts/${res.attempt.id}` })).json()).toEqual(before)
    await app.close()
  })
})
