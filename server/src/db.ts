import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import pg from 'pg'
import type { Config } from './config'

/**
 * One small interface over two real PostgreSQL engines:
 *   postgres  any PostgreSQL server, including Vultr Managed PostgreSQL (TLS on by default for remote hosts)
 *   pglite    PostgreSQL compiled to WebAssembly, embedded for local development and tests (no server to install)
 * The same SQL and migrations run on both.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  exec(sql: string): Promise<void>
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
  info: { provider: 'vultr' | 'postgres' | 'pglite'; target: string }
}

/** The database could not be reached. Surfaced as HTTP 503, never as a silent success. */
export class DbUnavailable extends Error {}

const CONNECTION_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', '57P01', '57P03', '53300'])

export function isConnectionError(e: unknown): boolean {
  if (e instanceof DbUnavailable) return true
  const err = e as { code?: string; message?: string }
  if (err?.code && (CONNECTION_CODES.has(err.code) || err.code.startsWith('08'))) return true
  return /timeout exceeded when trying to connect|Connection terminated|self[- ]signed certificate|certificate/i.test(err?.message ?? '')
}

/** A description safe to show and log: never the password, never the full connection string. */
export function describeError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code === 'ECONNREFUSED') return 'connection refused'
  if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') return 'host not found'
  if (err?.code === 'ETIMEDOUT' || /timeout/i.test(err?.message ?? '')) return 'connection timed out'
  if (err?.code === '28P01' || err?.code === '28000') return 'authentication failed'
  if (/certificate/i.test(err?.message ?? '')) return 'TLS certificate could not be verified'
  return err?.code ? `database error ${err.code}` : 'database error'
}

export async function openDb(cfg: Config['database']): Promise<Db> {
  return cfg.kind === 'postgres' ? openPostgres(cfg) : openPglite(cfg.dir)
}

function openPostgres(cfg: Extract<Config['database'], { kind: 'postgres' }>): Db {
  // TLS is configured explicitly below, so drop any sslmode in the URL (pg's own parsing of it differs from libpq's).
  const url = new URL(cfg.url)
  url.searchParams.delete('sslmode')
  const ssl =
    cfg.ssl === 'disable'
      ? false
      : cfg.ssl === 'verify-full'
        ? { rejectUnauthorized: true, ...(cfg.ca ? { ca: cfg.ca } : {}) }
        : { rejectUnauthorized: false }
  const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl,
    max: cfg.poolMax ?? 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
    application_name: 'thread',
  })
  pool.on('error', () => {
    // Idle client errors (e.g. the server restarted) are handled on the next query.
  })
  const host = url.hostname
  const run = async <T>(q: pg.Pool | pg.PoolClient, sql: string, params?: unknown[]) => {
    const r = await q.query(sql, params as unknown[])
    return { rows: r.rows as T[] }
  }
  return {
    info: { provider: host.endsWith('vultrdb.com') ? 'vultr' : 'postgres', target: `${host}:${url.port || 5432}` },
    query: (sql, params) => run(pool, sql, params),
    exec: async (sql) => {
      await pool.query(sql)
    },
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('begin')
        const out = await fn({
          query: (sql, params) => run(client, sql, params),
          exec: async (sql) => {
            await client.query(sql)
          },
        })
        await client.query('commit')
        return out
      } catch (e) {
        await client.query('rollback').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

async function openPglite(dir: string | null): Promise<Db> {
  if (dir) mkdirSync(dir, { recursive: true })
  const db = dir ? await PGlite.create(dir) : await PGlite.create()
  const wrap = (q: Pick<PGlite, 'query' | 'exec'>): Queryable => ({
    query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await q.query<T>(sql, params)).rows }),
    exec: async (sql) => {
      await q.exec(sql)
    },
  })
  return {
    info: { provider: 'pglite', target: dir ? 'embedded (on disk)' : 'embedded (in memory)' },
    ...wrap(db),
    tx: (fn) => db.transaction((t) => fn(wrap(t))),
    close: () => db.close(),
  }
}
