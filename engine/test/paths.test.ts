import { describe, expect, it } from 'vitest'
import {
  advance,
  buildView,
  decide,
  pendingDecision,
  SCENARIOS,
  scoreLines,
  start,
  submitHandover,
  templateDraft,
  type AttemptState,
  type DecisionInput,
  type DecisionPoint,
  type Scenario,
} from '../src'

/** Every path through every scenario: each course, each choice at each decision, with best and worst answers. */

const run = (s: Scenario, st: AttemptState) => {
  let cur = st
  while (cur.phase === 'prebrief' || cur.phase === 'playing') cur = advance(s, cur).state
  return cur
}

function inputFor(dp: DecisionPoint, choice: string, quality: 'best' | 'worst'): DecisionInput {
  const r = dp.recognition
  const flip = { observed: 'assumption', assumption: 'unknown', unknown: 'observed' } as const
  return {
    recognition:
      r.kind === 'dimensions'
        ? quality === 'best'
          ? r.options.filter((o) => o.changed).map((o) => o.id)
          : r.options.filter((o) => !o.changed).map((o) => o.id)
        : [[...r.options].sort((a, b) => (quality === 'best' ? b.points - a.points : a.points - b.points))[0]!.id],
    tags: Object.fromEntries(dp.statements.map((x) => [x.id, quality === 'best' ? x.answer : flip[x.answer]])),
    choice,
  }
}

function* paths(s: Scenario, st: AttemptState, quality: 'best' | 'worst'): Generator<AttemptState> {
  const cur = run(s, st)
  if (cur.phase === 'handover') {
    yield cur
    return
  }
  const dp = pendingDecision(s, cur)!
  for (const c of dp.choices) yield* paths(s, decide(s, cur, dp.id, inputFor(dp, c.id, quality)).state, quality)
}

describe.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: every path', (_id, s) => {
  const ends = s.courses.flatMap((c) => (['best', 'worst'] as const).flatMap((q) => [...paths(s, start(s, c.id), q)]))

  it('reaches the handover and a debrief on every path', () => {
    expect(ends.length).toBeGreaterThan(s.courses.length)
    for (const st of ends) {
      const done = submitHandover(s, st, templateDraft(s, st), 'template').state
      const v = buildView(s, done)
      expect(v.phase).toBe('complete')
      expect(v.debrief!.total).toBeGreaterThanOrEqual(0)
      expect(v.debrief!.total).toBeLessThanOrEqual(100)
      expect(scoreLines(done).reduce((n, l) => n + l.max, 0)).toBe(100)
      for (const l of scoreLines(done)) expect(l.earned).toBeGreaterThanOrEqual(0)
    }
  })

  it('visits every node on some path', () => {
    const seen = new Set(ends.flatMap((e) => e.path))
    expect([...Object.keys(s.nodes)].filter((n) => !seen.has(n))).toEqual([])
  })

  it('never reveals the same event twice, and every timeline is in time order', () => {
    for (const st of ends) {
      expect(new Set(st.revealed).size).toBe(st.revealed.length)
      const items = buildView(s, st).timeline.filter((t) => t.type === 'event')
      const keys = items.map((t) => `${s.days.indexOf(t.day)}-${t.clock}`)
      expect(keys).toEqual([...keys].sort())
    }
  })

  it('separates careful from careless play', () => {
    const score = (q: 'best' | 'worst') =>
      Math.max(...[...paths(s, start(s, s.defaultCourse), q)].map((st) => scoreLines(submitHandover(s, st, templateDraft(s, st), 'template').state).reduce((n, l) => n + l.earned, 0)))
    expect(score('best')).toBe(100)
    expect(score('worst')).toBeLessThanOrEqual(60)
  })
})
