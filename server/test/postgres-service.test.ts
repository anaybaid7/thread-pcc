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
  'sbar_drafts',
  'workspace_commands',
  'workspaces',
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

  it('migrates, stores commands, and replays a workspace', async () => {
    const app = buildApp({ db, gemini: new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }) })
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json().database).toMatchObject({ ok: true, schema: '002_ward.sql' })
    const ws = (await app.inject({ method: 'POST', url: '/api/workspaces' })).json()
    const after = (
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${ws.id}/commands`,
        payload: { seq: 0, command: { type: 'measure', by: 'sam', residentId: 'arthur', kind: 'fluids', value: 300 } },
      })
    ).json()
    expect((await app.inject({ method: 'GET', url: `/api/workspaces/${ws.id}` })).json()).toEqual(after)
    await app.close()
  })
})
