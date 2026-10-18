import type { AttemptState, Next, Scenario, ScenarioEvent, ScenarioNode } from './types'

export class EngineError extends Error {
  constructor(
    readonly code: 'not_now' | 'invalid',
    message: string,
  ) {
    super(message)
  }
}

export function node(s: Scenario, id: string): ScenarioNode {
  const n = s.nodes[id]
  if (!n) throw new EngineError('invalid', `Unknown node "${id}"`)
  return n
}

/** A node's events as this attempt sees them: some only appear after particular earlier choices. */
export function nodeEvents(s: Scenario, st: AttemptState, nodeId: string): ScenarioEvent[] {
  const chosen = new Set(st.decisions.map((d) => d.input.choice))
  return node(s, nodeId).events.filter((e) => !e.when || e.when.choices.some((c) => chosen.has(c)))
}

export function resolveNext(next: Next, course: string): string {
  if (typeof next === 'string') return next
  const to = next[course]
  if (!to) throw new EngineError('invalid', `No branch for course "${course}"`)
  return to
}

export function dayName(s: Scenario, day: number) {
  return s.days[day - 1] ?? `Day ${day}`
}

export function when(s: Scenario, t: { day: number; clock: string }) {
  return `${dayName(s, t.day).slice(0, 3)} ${t.clock}`
}
