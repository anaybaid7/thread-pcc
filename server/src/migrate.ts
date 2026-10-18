import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './config'
import type { Db } from './db'

const MIGRATIONS = resolve(ROOT, 'server/migrations')
const LOCK = 7_240_311

/** Apply each migration file once, in order, under an advisory lock so concurrent starts don't race. */
export async function migrate(db: Db): Promise<string[]> {
  return db.tx(async (q) => {
    await q.query('select pg_advisory_xact_lock($1)', [LOCK])
    await q.exec('create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())')
    const done = new Set((await q.query<{ version: string }>('select version from schema_migrations')).rows.map((r) => r.version))
    const applied: string[] = []
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(file)) continue
      await q.exec(readFileSync(resolve(MIGRATIONS, file), 'utf8'))
      await q.query('insert into schema_migrations (version) values ($1)', [file])
      applied.push(file)
    }
    return applied
  })
}
