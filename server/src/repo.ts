import { randomUUID } from 'node:crypto'
import { applyAll, seedWard, type Command, type Ward } from '@thread/engine'
import type { Db } from './db'

export class NotFound extends Error {}
export class Conflict extends Error {}

export interface Workspace {
  id: string
  seq: number
  ward: Ward
}

async function replay(db: Pick<Db, 'query'>, id: string): Promise<Workspace> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFound('No such workspace')
  const w = (await db.query<{ id: string; seq: number }>('select id, seq from workspaces where id = $1', [id])).rows[0]
  if (!w) throw new NotFound('No such workspace')
  const cmds = (await db.query<{ command: Command }>('select command from workspace_commands where workspace_id = $1 order by seq', [id])).rows
  return { id: w.id, seq: w.seq, ward: applyAll(seedWard(), cmds.map((c) => c.command)) }
}

export async function createWorkspace(db: Db): Promise<Workspace> {
  const id = randomUUID()
  await db.query('insert into workspaces (id) values ($1)', [id])
  return { id, seq: 0, ward: seedWard() }
}

export const loadWorkspace = replay

/**
 * Apply one command atomically: lock the workspace, check the sequence number the client saw, replay, apply (the
 * engine validates), append. A stale client gets a conflict instead of overwriting someone else's step.
 */
export async function send(db: Db, id: string, seq: number, command: Command): Promise<Workspace> {
  return db.tx(async (q) => {
    const locked = (await q.query<{ seq: number }>('select seq from workspaces where id = $1 for update', [id])).rows[0]
    if (!locked) throw new NotFound('No such workspace')
    if (locked.seq !== seq) throw new Conflict('This ward changed in another tab. Reload to continue.')
    const before = await replay(q, id)
    const ward = applyAll(before.ward, [command])
    const next = seq + 1
    await q.query('insert into workspace_commands (workspace_id, seq, command, ward_now) values ($1, $2, $3, $4)', [id, next, JSON.stringify(command), ward.now])
    await q.query('update workspaces set seq = $2, updated_at = now() where id = $1', [id, next])
    return { id, seq: next, ward }
  })
}

export async function saveSbar(db: Db, workspaceId: string, concernId: string, d: { source: string; model: string | null; fallbackReason: string | null; facts: unknown; draft: unknown; validation: string[] }) {
  const id = randomUUID()
  await db.query(
    'insert into sbar_drafts (id, workspace_id, concern_id, source, model, fallback_reason, facts, draft, validation) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, workspaceId, concernId, d.source, d.model, d.fallbackReason, JSON.stringify(d.facts), JSON.stringify(d.draft), JSON.stringify(d.validation)],
  )
  return id
}
