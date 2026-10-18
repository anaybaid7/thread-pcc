import { randomUUID } from 'node:crypto'
import {
  breakdown,
  buildView,
  debrief,
  EngineError,
  scoreLines,
  start,
  type AttemptState,
  type DecisionRecord,
  type Fact,
  type HandoverDraft,
  type HandoverRecord,
  type Scenario,
} from '@thread/engine'
import type { Db, Queryable } from './db'

export class NotFound extends Error {}
export class Conflict extends Error {}

export interface AttemptRow {
  id: string
  scenario_version_id: string
  course: string
  replay_of: string | null
  phase: string
  revision: number
  state: AttemptState
  total_score: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Loaded {
  row: AttemptRow
  scenario: Scenario
}

type LogEntry = { type: 'started' | 'event_revealed' | 'decision_made' | 'handover_drafted' | 'handover_submitted'; eventKey?: string; payload?: unknown }

async function appendLog(q: Queryable, attemptId: string, revision: number, entries: LogEntry[]) {
  const next = (await q.query<{ n: number }>('select coalesce(max(seq), 0)::int as n from attempt_events where attempt_id = $1', [attemptId])).rows[0]!.n
  let seq = next
  for (const e of entries) {
    seq += 1
    await q.query('insert into attempt_events (attempt_id, seq, type, event_key, revision, payload) values ($1, $2, $3, $4, $5, $6)', [
      attemptId,
      seq,
      e.type,
      e.eventKey ?? null,
      revision,
      JSON.stringify(e.payload ?? {}),
    ])
  }
}

export async function listScenarios(db: Db) {
  const { rows } = await db.query<{ id: string; version: number; definition: Scenario }>(
    `select distinct on (v.scenario_id) v.scenario_id as id, v.version, v.definition
       from scenario_versions v order by v.scenario_id, v.version desc`,
  )
  return rows.map((r) => r.definition)
}

async function latestVersion(q: Queryable, scenarioId: string) {
  const row = (
    await q.query<{ id: string; definition: Scenario }>(
      'select id, definition from scenario_versions where scenario_id = $1 order by version desc limit 1',
      [scenarioId],
    )
  ).rows[0]
  if (!row) throw new NotFound(`No scenario "${scenarioId}"`)
  return row
}

export async function createAttempt(db: Db, scenarioId: string, course?: string, replayOf?: string): Promise<Loaded> {
  return db.tx(async (q) => {
    let version: { id: string; definition: Scenario }
    if (replayOf) {
      // Replays use the same scenario version as the original, so the comparison is like for like.
      const orig = (
        await q.query<{ scenario_version_id: string; definition: Scenario }>(
          `select a.scenario_version_id, v.definition from simulation_attempts a
             join scenario_versions v on v.id = a.scenario_version_id where a.id = $1`,
          [replayOf],
        )
      ).rows[0]
      if (!orig) throw new NotFound('No such attempt to replay')
      version = { id: orig.scenario_version_id, definition: orig.definition }
    } else version = await latestVersion(q, scenarioId)
    const scenario = version.definition
    const state = start(scenario, course ?? scenario.defaultCourse)
    const id = randomUUID()
    const row = (
      await q.query<AttemptRow>(
        `insert into simulation_attempts (id, scenario_version_id, course, replay_of, phase, revision, state)
         values ($1, $2, $3, $4, $5, 0, $6) returning *`,
        [id, version.id, state.course, replayOf ?? null, state.phase, JSON.stringify(state)],
      )
    ).rows[0]!
    await appendLog(q, id, 0, [{ type: 'started', payload: { course: state.course, replayOf: replayOf ?? null } }])
    return { row, scenario }
  })
}

async function load(q: Queryable, id: string, lock: boolean): Promise<Loaded> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFound('No such attempt')
  const row = (
    await q.query<AttemptRow & { definition: Scenario }>(
      `select a.*, v.definition from simulation_attempts a
         join scenario_versions v on v.id = a.scenario_version_id
        where a.id = $1 ${lock ? 'for update of a' : ''}`,
      [id],
    )
  ).rows[0]
  if (!row) throw new NotFound('No such attempt')
  const { definition, ...rest } = row
  return { row: rest, scenario: definition }
}

export function loadAttempt(db: Db, id: string) {
  return load(db, id, false)
}

export interface Change {
  state: AttemptState
  log: LogEntry[]
  /** Extra rows to write in the same transaction. */
  write?: (q: Queryable, attemptId: string) => Promise<void>
}

/**
 * Apply one player command atomically: lock the attempt, check the revision the client saw, apply the engine, write
 * the new state, the log entries and any detail rows, then bump the revision. Completed attempts are immutable.
 */
export async function command(db: Db, id: string, revision: number, fn: (s: Scenario, st: AttemptState) => Change): Promise<Loaded> {
  return db.tx(async (q) => {
    const { row, scenario } = await load(q, id, true)
    if (row.phase === 'complete') throw new Conflict('This attempt is complete and can no longer change. Replay it to try again.')
    if (row.revision !== revision) throw new Conflict('This attempt changed in another tab. Reload to continue from where it is.')
    const change = fn(scenario, row.state)
    const st = change.state
    const done = st.phase === 'complete'
    const total = done ? breakdown(scoreLines(st)).total : null
    const updated = (
      await q.query<AttemptRow>(
        `update simulation_attempts set state = $2, phase = $3, revision = revision + 1, total_score = $4,
                updated_at = now(), completed_at = case when $5 then now() else null end
          where id = $1 returning *`,
        [id, JSON.stringify(st), st.phase, total, done],
      )
    ).rows[0]!
    await appendLog(q, id, updated.revision, change.log)
    await change.write?.(q, id)
    return { row: updated, scenario }
  })
}

export async function writeDecision(q: Queryable, attemptId: string, d: DecisionRecord) {
  const decisionId = (
    await q.query<{ id: string }>(
      `insert into player_decisions (attempt_id, decision_key, node_id, choice_key, input, evidence_event_keys, sim_day, sim_clock)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [attemptId, d.decisionId, d.nodeId, d.input.choice, JSON.stringify(d.input), d.evidence, d.at.day, d.at.clock],
    )
  ).rows[0]!.id
  for (const l of d.lines)
    await q.query('insert into decision_scores (attempt_id, decision_id, criterion, item, earned, max, reason) values ($1, $2, $3, $4, $5, $6, $7)', [
      attemptId,
      decisionId,
      l.criterion,
      l.item,
      l.earned,
      l.max,
      l.reason,
    ])
}

export async function writeHandover(q: Queryable, attemptId: string, s: Scenario, st: AttemptState, record: HandoverRecord, facts: Fact[]) {
  const draftId = randomUUID()
  await q.query(
    `insert into handover_drafts (id, attempt_id, kind, source, facts, fact_keys, draft) values ($1, $2, 'submitted', 'player', $3, $4, $5)`,
    [draftId, attemptId, JSON.stringify(facts), citedIds(record.draft), JSON.stringify({ ...record.draft, startedFrom: record.startedFrom })],
  )
  for (const l of record.lines)
    await q.query(
      'insert into decision_scores (attempt_id, handover_draft_id, criterion, item, earned, max, reason) values ($1, $2, $3, $4, $5, $6, $7)',
      [attemptId, draftId, l.criterion, l.item, l.earned, l.max, l.reason],
    )
  const b = breakdown(scoreLines(st))
  await q.query('insert into debrief_results (attempt_id, total, breakdown, debrief) values ($1, $2, $3, $4)', [
    attemptId,
    b.total,
    JSON.stringify(b),
    JSON.stringify(debrief(s, st)),
  ])
}

export function citedIds(d: HandoverDraft) {
  return [...new Set([d.situation, d.background, d.assessment, d.recommendation, ...d.unknowns].flatMap((x) => x.factIds))]
}

export async function saveDraft(
  db: Db,
  attemptId: string,
  draft: { source: 'gemini' | 'template'; model: string | null; fallbackReason: string | null; facts: Fact[]; draft: HandoverDraft; validation: string[] },
) {
  return db.tx(async (q) => {
    const id = randomUUID()
    await q.query(
      `insert into handover_drafts (id, attempt_id, kind, source, model, fallback_reason, facts, fact_keys, draft, validation)
       values ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9)`,
      [id, attemptId, draft.source, draft.model, draft.fallbackReason, JSON.stringify(draft.facts), citedIds(draft.draft), JSON.stringify(draft.draft), JSON.stringify(draft.validation)],
    )
    const rev = (await q.query<{ revision: number }>('select revision from simulation_attempts where id = $1', [attemptId])).rows[0]!.revision
    await appendLog(q, attemptId, rev, [{ type: 'handover_drafted', payload: { draftId: id, source: draft.source, fallbackReason: draft.fallbackReason } }])
    return id
  })
}

export async function countDrafts(db: Db, attemptId: string, source: 'gemini') {
  return (await db.query<{ n: number }>("select count(*)::int as n from handover_drafts where attempt_id = $1 and kind = 'draft' and source = $2 and fallback_reason is null", [attemptId, source])).rows[0]!.n
}

export async function listAttempts(db: Db, limit = 20) {
  const { rows } = await db.query<{
    id: string
    scenario_id: string
    title: string
    phase: string
    course: string
    total_score: number | null
    replay_of: string | null
    created_at: string
    completed_at: string | null
    decisions: number
  }>(
    `select a.id, v.scenario_id, s.title, a.phase, a.course, a.total_score, a.replay_of, a.created_at, a.completed_at,
            (select count(*)::int from player_decisions d where d.attempt_id = a.id) as decisions
       from simulation_attempts a
       join scenario_versions v on v.id = a.scenario_version_id
       join scenarios s on s.id = v.scenario_id
      order by a.created_at desc limit $1`,
    [limit],
  )
  // The course is part of the debrief: only shown once an attempt is complete.
  return rows.map((r) => ({ ...r, course: r.phase === 'complete' ? r.course : null }))
}

export async function attemptLog(db: Db, attemptId: string) {
  return (
    await db.query<{ seq: number; type: string; event_key: string | null; revision: number; payload: unknown; created_at: string }>(
      'select seq, type, event_key, revision, payload, created_at from attempt_events where attempt_id = $1 order by seq',
      [attemptId],
    )
  ).rows
}

export function present({ row, scenario }: Loaded) {
  return {
    attempt: {
      id: row.id,
      revision: row.revision,
      scenarioId: scenario.id,
      version: scenario.version,
      replayOf: row.replay_of,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    },
    view: buildView(scenario, row.state),
  }
}

export { EngineError }
