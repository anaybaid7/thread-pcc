import { deriveConcerns, handover, type Command, type Ward } from '@thread/engine'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { readConfig } from '../src/config'
import { openDb, type Db } from '../src/db'
import { GeminiDrafter } from '../src/gemini'
import { migrate } from '../src/migrate'

type WS = { id: string; seq: number; ward: Ward }

let db: Db
let app: FastifyInstance
const noKey = () => new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null })

beforeAll(async () => {
  db = await openDb({ kind: 'pglite', dir: null })
  app = buildApp({ db, gemini: noKey() })
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await db.close()
})

const post = async (url: string, payload: object = {}) => app.inject({ method: 'POST', url, payload })
const cmd = async (ws: WS, command: Command) => {
  const r = await post(`/api/workspaces/${ws.id}/commands`, { seq: ws.seq, command })
  expect(r.statusCode, r.body).toBe(200)
  return r.json() as WS
}

const checkin: Command = {
  type: 'checkin',
  by: 'maya',
  residentId: 'evelyn',
  findings: [
    { area: 'mobility', status: 'different', finding: 'Stayed in bed or room' },
    { area: 'eating', status: 'different', finding: 'Ate about a quarter' },
    { area: 'drinking', status: 'unchecked' },
  ],
}

describe('workspaces', () => {
  it('migrations are idempotent', async () => {
    await migrate(db)
    expect(await migrate(db)).toEqual([])
  })

  it('reports health with the schema version', async () => {
    const h = (await app.inject({ method: 'GET', url: '/api/health' })).json()
    expect(h).toMatchObject({ status: 'ok', database: { ok: true, provider: 'pglite', schema: '002_ward.sql' } })
  })

  it('runs the three workflows and replays them from the stored commands', async () => {
    let ws = (await post('/api/workspaces')).json() as WS
    ws = await cmd(ws, checkin)
    const id = deriveConcerns(ws.ward).find((c) => c.residentId === 'evelyn')!.id
    ws = await cmd(ws, { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'temp', value: 37.6 })
    ws = await cmd(ws, { type: 'plan', by: 'priya', concernId: id, decision: 'watch', recheckIn: 120, recheck: ['eating'] })
    ws = await cmd(ws, { type: 'advance', to: 1440 + 900 })
    for (const i of handover(ws.ward).items) ws = await cmd(ws, { type: 'ack', by: 'daniel', key: i.key })
    expect(handover(ws.ward).items.every((i) => i.ack)).toBe(true)
    // A fresh load replays the same ward from PostgreSQL.
    const loaded = (await app.inject({ method: 'GET', url: `/api/workspaces/${ws.id}` })).json() as WS
    expect(loaded).toEqual(ws)
    const rows = (await db.query<{ n: number }>('select count(*)::int n from workspace_commands where workspace_id = $1', [ws.id])).rows[0]!.n
    expect(rows).toBe(ws.seq)
  })

  it('drafts an SBAR from the template without a key, and stores it', async () => {
    let ws = (await post('/api/workspaces')).json() as WS
    ws = await cmd(ws, checkin)
    const id = deriveConcerns(ws.ward).find((c) => c.residentId === 'evelyn')!.id
    const r = (await post(`/api/workspaces/${ws.id}/sbar`, { concernId: id })).json()
    expect(r.source).toBe('template')
    expect(r.fallbackReason).toMatch(/not configured/)
    expect(r.draft.situation).toContain('ate about a quarter')
    const n = (await db.query<{ n: number }>('select count(*)::int n from sbar_drafts where workspace_id = $1', [ws.id])).rows[0]!.n
    expect(n).toBe(1)
  })
})

describe('errors are explicit', () => {
  it('rejects a stale sequence number instead of overwriting', async () => {
    const ws = (await post('/api/workspaces')).json() as WS
    await cmd(ws, checkin)
    const r = await post(`/api/workspaces/${ws.id}/commands`, { seq: 0, command: checkin })
    expect(r.statusCode).toBe(409)
  })

  it('rejects malformed and rule-breaking commands, and saves nothing', async () => {
    const ws = (await post('/api/workspaces')).json() as WS
    expect((await post(`/api/workspaces/${ws.id}/commands`, { seq: 0, command: { type: 'nope' } })).statusCode).toBe(400)
    const r = await post(`/api/workspaces/${ws.id}/commands`, { seq: 0, command: { type: 'resolve', by: 'priya', concernId: 'r3' } })
    expect(r.statusCode).toBe(400)
    expect(r.json().message).toMatch(/no outcome recorded/)
    const seq = (await db.query<{ seq: number }>('select seq from workspaces where id = $1', [ws.id])).rows[0]!.seq
    expect(seq).toBe(0)
    expect((await app.inject({ method: 'GET', url: '/api/workspaces/not-an-id' })).statusCode).toBe(404)
  })

  it('returns 503, not success, when the database is unavailable', async () => {
    const fail = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    }
    const broken: Db = { info: { provider: 'postgres', target: 'db.example:5432' }, query: fail, exec: fail, tx: fail, close: async () => {} }
    const down = buildApp({ db: broken, gemini: noKey() })
    expect((await down.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(503)
    const c = await down.inject({ method: 'POST', url: '/api/workspaces' })
    expect(c.statusCode).toBe(503)
    expect(c.json().message).toMatch(/Nothing was saved/)
    await down.close()
  })
})
