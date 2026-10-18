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
  it('migrates, seeds and plays through the API', async () => {
    const app = buildApp({ db, gemini: new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }) })
    const h = await app.inject({ method: 'GET', url: '/api/health' })
    expect(h.json()).toMatchObject({ status: 'ok', database: { ok: true, provider: 'postgres', schema: '001_init.sql' } })
    let res = (await app.inject({ method: 'POST', url: '/api/attempts', payload: { scenarioId: 'evelyn' } })).json()
    while (res.view.canAdvance)
      res = (await app.inject({ method: 'POST', url: `/api/attempts/${res.attempt.id}/advance`, payload: { revision: res.attempt.revision } })).json()
    expect(res.view.phase).toBe('decision')
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
    const row = (await db.query<{ evidence_event_keys: string[] }>('select evidence_event_keys from player_decisions where attempt_id = $1', [res.attempt.id])).rows[0]!
    expect(row.evidence_event_keys).toHaveLength(6)
    await app.close()
  })

  it('rolls back a failed transaction', async () => {
    await expect(
      db.tx(async (q) => {
        await q.query("insert into scenarios (id, title, subtitle) values ('tmp', 't', 's')")
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect((await db.query("select 1 from scenarios where id = 'tmp'")).rows).toHaveLength(0)
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
