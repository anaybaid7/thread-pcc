import {
  advance,
  buildView,
  decide,
  getScenario,
  start,
  submitHandover,
  templateDraft,
  type AttemptState,
  type AttemptView,
  type DecisionInput,
  type DraftSource,
  type HandoverDraft,
  type Scenario,
} from '@thread/engine'

/**
 * Two ways to play, one engine:
 *   saved     the THREAD API runs the engine and persists every step in PostgreSQL
 *   practice  the same engine runs in this browser tab; nothing is saved (the GitHub Pages build, or by choice when
 *             the database is unavailable). Always labelled as such.
 */

export const STATIC = process.env.NEXT_PUBLIC_DATA_MODE === 'static'

export type Mode = 'saved' | 'practice'

export interface Snapshot {
  mode: Mode
  id: string
  revision: number
  replayOf: string | null
  view: AttemptView
}

export interface DraftResponse {
  draft: HandoverDraft
  source: DraftSource
  model: string | null
  fallbackReason: string | null
  validation: string[]
  saved: boolean
}

export interface Health {
  status: 'ok' | 'degraded'
  database: { ok: boolean; provider: 'vultr' | 'postgres' | 'pglite'; target: string; error?: string; latencyMs?: number }
  gemini: { configured: boolean; model: string; maxDraftsPerAttempt: number }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
  }
  get unavailable() {
    return this.status === 503 || this.status === 0 || this.status === 502 || this.status === 504
  }
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'The THREAD server can’t be reached. Nothing was saved.')
  }
  const data = (await res.json().catch(() => null)) as (T & { message?: string; error?: string }) | null
  // A 5xx without our JSON body comes from the proxy in front of the API: the server itself isn't answering.
  if (!res.ok && !data && res.status >= 500) throw new ApiError(502, 'The THREAD server can’t be reached. Nothing was saved.')
  if (!res.ok)
    throw new ApiError(res.status, data?.message ?? `The server answered ${res.status}. Nothing was saved.`, data?.error)
  return data as T
}

type ServerAttempt = { attempt: { id: string; revision: number; replayOf: string | null }; view: AttemptView }
const fromServer = (r: ServerAttempt): Snapshot => ({ mode: 'saved', id: r.attempt.id, revision: r.attempt.revision, replayOf: r.attempt.replayOf, view: r.view })

export const server = {
  /** Health answers 503 with a body when the database is down; null means the server itself is unreachable. */
  health: async (): Promise<Health | null> => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' })
      return (await r.json()) as Health
    } catch {
      return null
    }
  },
  create: async (scenarioId: string) => fromServer(await api('/attempts', { method: 'POST', body: { scenarioId } })),
  load: async (id: string) => fromServer(await api(`/attempts/${id}`)),
  advance: async (s: Snapshot) => fromServer(await api(`/attempts/${s.id}/advance`, { method: 'POST', body: { revision: s.revision } })),
  decide: async (s: Snapshot, decisionId: string, input: DecisionInput) =>
    fromServer(await api(`/attempts/${s.id}/decisions`, { method: 'POST', body: { revision: s.revision, decisionId, ...input } })),
  draft: (s: Snapshot, factIds: string[]) => api<DraftResponse>(`/attempts/${s.id}/handover/draft`, { method: 'POST', body: { factIds } }),
  submit: async (s: Snapshot, draft: HandoverDraft, startedFrom: DraftSource | 'blank') =>
    fromServer(await api(`/attempts/${s.id}/handover`, { method: 'POST', body: { revision: s.revision, draft, startedFrom } })),
  replay: async (s: Snapshot, course: 'same' | 'other') => fromServer(await api(`/attempts/${s.id}/replay`, { method: 'POST', body: { course } })),
  list: () =>
    api<{
      attempts: {
        id: string
        title: string
        phase: string
        course: string | null
        total_score: number | null
        replay_of: string | null
        created_at: string
        decisions: number
      }[]
    }>('/attempts'),
}

// ── Practice mode: the engine in this tab ───────────────────────────────────
//
// The engine is deterministic, so a practice attempt is fully described by its scenario, its course and the commands
// played. That log is kept in sessionStorage; a refresh replays it and lands exactly where the player was.

type Cmd = { t: 'advance' } | { t: 'decide'; id: string; input: DecisionInput } | { t: 'submit'; draft: HandoverDraft; from: DraftSource | 'blank' }
type Practice = { id: string; scenario: Scenario; course: string; state: AttemptState; replayOf: string | null; cmds: Cmd[] }

const practice = new Map<string, Practice>()
const STORE = 'thread:practice'

function save(p: Practice) {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ id: p.id, scenarioId: p.scenario.id, version: p.scenario.version, course: p.course, replayOf: p.replayOf, cmds: p.cmds }))
  } catch {
    // Storage can be unavailable (private mode); practice still works, it just won't survive a refresh.
  }
}

function apply(sc: Scenario, st: AttemptState, c: Cmd): AttemptState {
  if (c.t === 'advance') return advance(sc, st).state
  if (c.t === 'decide') return decide(sc, st, c.id, c.input).state
  return submitHandover(sc, st, c.draft, c.from).state
}

function practiceSnap(id: string): Snapshot {
  const p = practice.get(id)!
  return { mode: 'practice', id, revision: p.cmds.length, replayOf: p.replayOf, view: buildView(p.scenario, p.state) }
}

function practiceStart(scenario: Scenario, course?: string, replayOf: string | null = null) {
  const id = `practice-${crypto.randomUUID().slice(0, 8)}`
  const p: Practice = { id, scenario, course: course ?? scenario.defaultCourse, state: start(scenario, course), replayOf, cmds: [] }
  practice.set(id, p)
  save(p)
  return practiceSnap(id)
}

function step(s: Snapshot, c: Cmd): Snapshot {
  const p = practice.get(s.id)
  if (!p) throw new ApiError(404, 'This practice attempt is no longer in memory. Start again.')
  const next = { ...p, state: apply(p.scenario, p.state, c), cmds: [...p.cmds, c] }
  practice.set(s.id, next)
  save(next)
  return practiceSnap(s.id)
}

const wrap = <T>(fn: () => T): Promise<T> => {
  try {
    return Promise.resolve(fn())
  } catch (e) {
    return Promise.reject(new ApiError(400, (e as Error).message))
  }
}

export const local = {
  create: (scenarioId: string) =>
    wrap(() => {
      const sc = getScenario(scenarioId)
      if (!sc) throw new Error(`No scenario "${scenarioId}"`)
      return practiceStart(sc)
    }),
  /** The practice attempt from this tab's session, replayed through the engine, if it is for this scenario. */
  resume: (scenarioId: string): Snapshot | null => {
    try {
      const raw = sessionStorage.getItem(STORE)
      if (!raw) return null
      const saved = JSON.parse(raw) as { id: string; scenarioId: string; version: number; course: string; replayOf: string | null; cmds: Cmd[] }
      const sc = getScenario(saved.scenarioId)
      if (!sc || saved.scenarioId !== scenarioId || sc.version !== saved.version) return null
      const state = saved.cmds.reduce((st, c) => apply(sc, st, c), start(sc, saved.course))
      if (state.phase === 'complete') return null
      practice.set(saved.id, { id: saved.id, scenario: sc, course: saved.course, state, replayOf: saved.replayOf, cmds: saved.cmds })
      return practiceSnap(saved.id)
    } catch {
      return null
    }
  },
  advance: (s: Snapshot) => wrap(() => step(s, { t: 'advance' })),
  decide: (s: Snapshot, decisionId: string, input: DecisionInput) => wrap(() => step(s, { t: 'decide', id: decisionId, input })),
  draft: (s: Snapshot, factIds: string[]): Promise<DraftResponse> =>
    wrap(() => {
      const p = practice.get(s.id)!
      return {
        draft: templateDraft(p.scenario, p.state, factIds),
        source: 'template' as const,
        model: null,
        fallbackReason: 'Practice mode runs in your browser, so AI drafting is off.',
        validation: [],
        saved: false,
      }
    }),
  submit: (s: Snapshot, draft: HandoverDraft, startedFrom: DraftSource | 'blank') => wrap(() => step(s, { t: 'submit', draft, from: startedFrom })),
  replay: (s: Snapshot, course: 'same' | 'other') =>
    wrap(() => {
      const p = practice.get(s.id)!
      const next = course === 'same' ? p.course : (p.scenario.courses.find((c) => c.id !== p.course)?.id ?? p.course)
      return practiceStart(p.scenario, next, s.id)
    }),
}

export const backendFor = (mode: Mode) => (mode === 'saved' ? server : local)
