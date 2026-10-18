import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { readConfig } from '../src/config'
import { openDb, type Db } from '../src/db'
import { GeminiDrafter } from '../src/gemini'

/**
 * The node-postgres path (the one used for Vultr Managed PostgreSQL), exercised over the real PostgreSQL wire
 * protocol against a PGlite socket server. TLS is not covered here: it needs a real server with a certificate.
 */

let pglite: PGlite
let server: PGLiteSocketServer
let db: Db

beforeAll(async () => {
  pglite = await PGlite.create()
  server = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1' })
  await server.start()
  const cfg = readConfig({ DATABASE_URL: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`, DATABASE_POOL_MAX: '1' })
  expect(cfg.database).toMatchObject({ kind: 'postgres', ssl: 'disable' })
  db = await openDb(cfg.database)
})

afterAll(async () => {
  await db.close()
  await server.stop()
  await pglite.close()
})

describe('node-postgres driver', () => {
  it('migrates and stores ward commands over the wire protocol', async () => {
    const app = buildApp({ db, gemini: new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }) })
    expect((await app.inject({ method: 'GET', url: '/api/health' })).json()).toMatchObject({ status: 'ok', database: { ok: true, provider: 'postgres', schema: '002_ward.sql' } })
    const ws = (await app.inject({ method: 'POST', url: '/api/workspaces' })).json()
    const r = await app.inject({
      method: 'POST',
      url: `/api/workspaces/${ws.id}/commands`,
      payload: { seq: 0, command: { type: 'checkin', by: 'maya', residentId: 'evelyn', findings: [{ area: 'eating', status: 'different', finding: 'Ate about a quarter' }] } },
    })
    expect(r.statusCode, r.body).toBe(200)
    expect((await db.query<{ n: number }>('select count(*)::int n from workspace_commands')).rows[0]!.n).toBe(1)
    await app.close()
  })

  it('rolls back a failed transaction', async () => {
    await expect(
      db.tx(async (q) => {
        await q.query("insert into workspaces (id) values ('00000000-0000-0000-0000-000000000001')")
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect((await db.query("select 1 from workspaces where id = '00000000-0000-0000-0000-000000000001'")).rows).toHaveLength(0)
  })
})

describe('configuration', () => {
  it('uses TLS for remote hosts and verifies when a CA is given', () => {
    const vultr = 'postgresql://vultradmin:secret@example-thread.vultrdb.com:16751/defaultdb?sslmode=require'
    expect(readConfig({ DATABASE_URL: vultr }).database).toMatchObject({ kind: 'postgres', ssl: 'require' })
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----'
    expect(readConfig({ DATABASE_URL: vultr, DATABASE_CA_CERT: pem }).database).toMatchObject({ ssl: 'verify-full', ca: pem })
    expect(readConfig({}).database).toMatchObject({ kind: 'pglite' })
  })
})
