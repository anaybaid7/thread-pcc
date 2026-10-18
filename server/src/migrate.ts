import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SCENARIOS, type Scenario } from '@thread/engine'
import { ROOT } from './config'
import type { Db, Queryable } from './db'

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

export function contentHash(s: Scenario) {
  return createHash('sha256').update(JSON.stringify(s)).digest('hex')
}

/**
 * Seed every scenario version the engine ships. Idempotent. A version, once seeded, is immutable: if its content
 * changed without a version bump, seeding fails loudly rather than silently altering what old attempts were played on.
 */
export async function seed(db: Db, scenarios: Scenario[] = SCENARIOS): Promise<string[]> {
  const seeded: string[] = []
  for (const s of scenarios) {
    await db.tx(async (q) => {
      await q.query('select pg_advisory_xact_lock($1)', [LOCK])
      await q.query(
        `insert into scenarios (id, title, subtitle) values ($1, $2, $3)
         on conflict (id) do update set title = excluded.title, subtitle = excluded.subtitle`,
        [s.id, s.title, s.subtitle],
      )
      const hash = contentHash(s)
      const existing = (
        await q.query<{ id: string; content_hash: string }>('select id, content_hash from scenario_versions where scenario_id = $1 and version = $2', [s.id, s.version])
      ).rows[0]
      if (existing) {
        if (existing.content_hash !== hash)
          throw new Error(`Scenario "${s.id}" v${s.version} changed since it was seeded. Bump its version so earlier attempts keep theirs.`)
        return
      }
      const versionId = (
        await q.query<{ id: string }>(
          'insert into scenario_versions (scenario_id, version, content_hash, definition) values ($1, $2, $3, $4) returning id',
          [s.id, s.version, hash, JSON.stringify(s)],
        )
      ).rows[0]!.id
      const r = s.resident
      await q.query(
        `insert into resident_profiles (scenario_version_id, resident_key, display_name, profile, baseline) values ($1, $2, $3, $4, $5)`,
        [versionId, r.id, r.name, JSON.stringify({ ...r, baseline: undefined }), JSON.stringify({ facts: r.baseline, series: s.baselineSeries, dimensions: s.dimensions })],
      )
      await insertEvents(q, versionId, s)
      seeded.push(`${s.id} v${s.version}`)
    })
  }
  return seeded
}

async function insertEvents(q: Queryable, versionId: string, s: Scenario) {
  for (const n of Object.values(s.nodes)) {
    let seq = 0
    for (const e of n.events) {
      await q.query(
        `insert into scenario_events (scenario_version_id, node_id, event_key, seq, sim_day, sim_clock, kind, source, body)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) on conflict do nothing`,
        [versionId, n.id, e.id, seq++, e.day, e.clock, e.kind, e.source, JSON.stringify(e)],
      )
    }
  }
}
