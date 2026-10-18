import { describe, expect, it } from 'vitest'
import {
  advance,
  buildView,
  decide,
  EngineError,
  evelyn,
  handoverFacts,
  languageIssues,
  nodeEvents,
  pendingDecision,
  resolveNext,
  scenarioMap,
  SCENARIOS,
  scoreLines,
  start,
  submitHandover,
  templateDraft,
  validateDraft,
  type AttemptState,
  type DecisionInput,
  type DecisionPoint,
  type Scenario,
} from '../src'

/** Advance until something other than "playing" is waiting. */
function runToStop(s: Scenario, st: AttemptState): AttemptState {
  let cur = st
  for (let i = 0; i < 200 && (cur.phase === 'prebrief' || cur.phase === 'playing'); i++) cur = advance(s, cur).state
  return cur
}

function perfect(dp: DecisionPoint, choice?: string): DecisionInput {
  const r = dp.recognition
  return {
    recognition:
      r.kind === 'dimensions'
        ? r.options.filter((o) => o.changed).map((o) => o.id)
        : [[...r.options].sort((a, b) => b.points - a.points)[0]!.id],
    tags: Object.fromEntries(dp.statements.map((x) => [x.id, x.answer])),
    choice: choice ?? [...dp.choices].sort((a, b) => b.communication - a.communication)[0]!.id,
  }
}

/** Play a whole attempt, choosing per decision id (default: the best answer). */
function play(s: Scenario, course: string, choose: Record<string, string> = {}, input?: (dp: DecisionPoint) => DecisionInput) {
  let st = runToStop(s, start(s, course))
  while (st.phase === 'decision') {
    const dp = pendingDecision(s, st)!
    st = runToStop(s, decide(s, st, dp.id, input ? input(dp) : perfect(dp, choose[dp.id])).state)
  }
  expect(st.phase).toBe('handover')
  return st
}

function finish(s: Scenario, st: AttemptState) {
  return submitHandover(s, st, templateDraft(s, st), 'template').state
}

const total = (st: AttemptState) => scoreLines(st).reduce((n, l) => n + l.earned, 0)

describe('scenario data', () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: every branch target exists, every node has events, event ids are unique`, () => {
      const ids = new Set<string>()
      for (const n of Object.values(s.nodes)) {
        expect(n.events.length, n.id).toBeGreaterThan(0)
        for (const e of n.events) {
          if (n.id.includes('_told_') || n.id.includes('_untold_')) {
            // shared opening events appear in sibling nodes by design
          } else expect(ids.has(e.id), e.id).toBe(false)
          ids.add(e.id)
        }
        const targets = [n.next, ...(n.decision?.choices.map((c) => c.next) ?? [])].filter((x) => x !== undefined)
        for (const t of targets) for (const c of s.courses) expect(s.nodes[resolveNext(t, c.id)], `${n.id} → ${c.id}`).toBeDefined()
      }
    })

    it(`${s.id}: best play scores exactly 100 on every course`, () => {
      for (const c of s.courses) expect(total(finish(s, play(s, c.id)))).toBe(100)
    })
  }
})

describe('determinism', () => {
  it('the same state and choice always produce the same branch and state', () => {
    for (const course of ['persist', 'resolve'])
      for (const choice of evelyn.nodes.mon_morning!.decision!.choices) {
        const a = runToStop(evelyn, start(evelyn, course))
        const b = runToStop(evelyn, start(evelyn, course))
        expect(a).toEqual(b)
        const dp = pendingDecision(evelyn, a)!
        const ra = decide(evelyn, a, dp.id, perfect(dp, choice.id))
        const rb = decide(evelyn, b, dp.id, perfect(dp, choice.id))
        expect(ra).toEqual(rb)
        expect(ra.state.nodeId).toBe(resolveNext(choice.next, course))
      }
  })

  it('branches: telling the nurse keeps her informed; waiting reveals missed context', () => {
    const told = play(evelyn, 'persist', { d1: 'tell' })
    expect(told.path).toContain('mon_told_persist')
    expect(told.revealed).toContain('a0')
    const waited = play(evelyn, 'persist', { d1: 'wait' })
    expect(waited.path).toContain('mon_untold_persist')
    expect(waited.revealed).toContain('up2')
    expect(waited.revealed).not.toContain('u0')
    const charted = play(evelyn, 'persist', { d1: 'chart' })
    expect(charted.revealed).toEqual(expect.arrayContaining(['u0', 'up3']))
    const resolved = play(evelyn, 'resolve', { d1: 'tell' })
    expect(resolved.path).toEqual(expect.arrayContaining(['mon_told_resolve', 'tue_resolve']))
  })

  it('does not advance while a decision is waiting, and a decision cannot be made twice', () => {
    const st = runToStop(evelyn, start(evelyn))
    expect(st.phase).toBe('decision')
    expect(() => advance(evelyn, st)).toThrow(EngineError)
    const dp = pendingDecision(evelyn, st)!
    const after = decide(evelyn, st, dp.id, perfect(dp)).state
    expect(() => decide(evelyn, after, dp.id, perfect(dp))).toThrow(EngineError)
  })

  it('rejects incomplete input instead of guessing', () => {
    const st = runToStop(evelyn, start(evelyn))
    const dp = pendingDecision(evelyn, st)!
    const input = perfect(dp)
    const { s1: _drop, ...partial } = input.tags
    expect(() => decide(evelyn, st, dp.id, { ...input, tags: partial })).toThrow(/every statement/)
    expect(() => decide(evelyn, st, dp.id, { ...input, choice: 'nope' })).toThrow(/Choose/)
  })
})

describe('scoring', () => {
  it('is deterministic and adds up to the rubric', () => {
    const a = finish(evelyn, play(evelyn, 'persist', { d1: 'chart', d2_persist: 'encourage' }))
    const b = finish(evelyn, play(evelyn, 'persist', { d1: 'chart', d2_persist: 'encourage' }))
    expect(scoreLines(a)).toEqual(scoreLines(b))
    const max = scoreLines(a).reduce((n, l) => n + l.max, 0)
    expect(max).toBe(100)
  })

  it('judges a decision only on what was known then: the course never changes its score', () => {
    for (const choice of evelyn.nodes.mon_morning!.decision!.choices) {
      const persist = play(evelyn, 'persist', { d1: choice.id }).decisions[0]!
      const resolve = play(evelyn, 'resolve', { d1: choice.id }).decisions[0]!
      expect(persist.lines).toEqual(resolve.lines)
    }
  })

  it('records exactly the evidence revealed at the moment of the decision', () => {
    const st = play(evelyn, 'persist')
    const d1 = st.decisions[0]!
    expect(d1.evidence).toEqual(nodeEvents(evelyn, start(evelyn), 'mon_morning').map((e) => e.id))
    expect(d1.evidence).not.toContain('tp5')
    const d2 = st.decisions[1]!
    expect(d2.evidence).toContain('tp7')
    expect(d2.evidence.length).toBeGreaterThan(d1.evidence.length)
  })

  it('gives no points for guessing a cause', () => {
    const st = play(evelyn, 'persist', { d1: 'cause' })
    const comm = st.decisions[0]!.lines.find((l) => l.criterion === 'communication')!
    expect(comm.earned).toBeLessThan(comm.max / 2)
    const view = buildView(evelyn, finish(evelyn, st))
    expect(view.debrief!.slips.join(' ')).toMatch(/guess about the cause/)
  })
})

describe('unknowns are never treated as facts', () => {
  it('marking an unrecorded drink as observed loses the points and says why', () => {
    const st = runToStop(evelyn, start(evelyn))
    const dp = pendingDecision(evelyn, st)!
    const input = perfect(dp)
    input.tags.s4 = 'observed'
    const line = decide(evelyn, st, dp.id, input).record.lines.find((l) => l.criterion === 'evidence')!
    expect(line.earned).toBe(line.max - dp.pointsPerStatement)
    expect(line.reason).toMatch(/enough to drink.*unknown, not an observation/)
  })

  it('the fallback handover keeps unknowns out of the assessment and lists them as unknowns', () => {
    const st = play(evelyn, 'persist', { d1: 'wait' })
    const facts = handoverFacts(evelyn, st)
    const draft = templateDraft(evelyn, st)
    const kind = (id: string) => facts.find((f) => f.id === id)!.kind
    expect(draft.assessment.factIds.every((id) => kind(id) !== 'unknown')).toBe(true)
    expect(draft.unknowns.length).toBeGreaterThan(0)
    expect(draft.unknowns.every((u) => u.factIds.every((id) => kind(id) === 'unknown'))).toBe(true)
    expect(validateDraft(draft, facts, { strict: true }).errors).toEqual([])
  })

  it('a draft citing an unknown in the assessment is rejected (strict) and scores zero there', () => {
    const st = play(evelyn, 'persist')
    const facts = handoverFacts(evelyn, st)
    const draft = templateDraft(evelyn, st)
    draft.assessment.factIds.push('tp8')
    expect(validateDraft(draft, facts, { strict: false }).errors.join()).toMatch(/unknown/)
    // The player's submission is rejected for the same structural reason.
    expect(() => submitHandover(evelyn, st, draft, 'template')).toThrow(/as if it were known/)
  })

  it('strict validation rejects invented numbers and diagnostic language', () => {
    const st = play(evelyn, 'persist')
    const facts = handoverFacts(evelyn, st)
    const draft = templateDraft(evelyn, st)
    draft.assessment.text += '\nTemperature 38.4.'
    draft.situation.text = 'Evelyn probably has a urinary infection.'
    const errors = validateDraft(draft, facts, { strict: true }).errors.join(' ')
    expect(errors).toMatch(/38.4/)
    expect(errors).toMatch(/diagnosis/)
  })

  it('language checks are conservative', () => {
    expect(languageIssues('Fluid record: one cup and half of another')).toEqual([])
    expect(languageIssues('Needs antibiotics')[0]!.why).toMatch(/treatment/)
    expect(languageIssues('She’s safe, nothing to worry about')).toHaveLength(1)
  })
})

describe('view', () => {
  it('never sends the answers of a pending decision, and hides the course until the debrief', () => {
    const st = runToStop(evelyn, start(evelyn))
    const v = buildView(evelyn, st)
    const json = JSON.stringify(v.decision)
    expect(json).not.toMatch(/"answer"|"changed"|"points"|"communication"|"feedback"/)
    expect(v.debrief).toBeNull()
    expect(JSON.stringify(v)).not.toMatch(/persist/)
  })

  it('the chart grows only with revealed observations', () => {
    const s0 = start(evelyn)
    expect(buildView(evelyn, s0).chart.filter((p) => p.phase === 'observed')).toHaveLength(0)
    const s1 = advance(evelyn, s0).state
    const observed = buildView(evelyn, s1).chart.filter((p) => p.phase === 'observed')
    expect(observed).toHaveLength(1)
    expect(observed[0]!.values.mobility).toBe(60)
  })

  it('the debrief names the other course and the alternatives', () => {
    const v = buildView(evelyn, finish(evelyn, play(evelyn, 'resolve', { d1: 'wait', d2_resolve: 'silent' })))
    expect(v.debrief!.course.id).toBe('resolve')
    expect(v.debrief!.otherCourses.map((c) => c.id)).toEqual(['persist'])
    expect(v.debrief!.alternatives[0]!.options.find((o) => o.chosen)!.label).toMatch(/off day/)
    expect(v.debrief!.total).toBeLessThan(100)
  })
})

describe('who knew, and the scenario map', () => {
  it('telling the nurse spreads awareness; waiting leaves the next shift in the dark', () => {
    const told = buildView(evelyn, play(evelyn, 'persist', { d1: 'tell' }))
    const waited = buildView(evelyn, play(evelyn, 'persist', { d1: 'wait' }))
    const knows = (v: typeof told, id: string) => v.people.find((p) => p.id === id)!.since
    expect(knows(told, 'priya')).not.toBeNull()
    expect(knows(told, 'eve_rpn')).not.toBeNull()
    // Priya only hears on Tuesday, after the second decision.
    expect(knows(waited, 'priya')).toBeGreaterThan(1440)
    expect(knows(told, 'priya')).toBe(11 * 60 + 10)
    expect(knows(waited, 'eve_rpn')).toBeNull()
    expect(waited.flows.some((f) => !f.passed && f.to === 'grace')).toBe(true)
  })

  it('a hand-off only carries what the sender knew', () => {
    const v = buildView(evelyn, play(evelyn, 'persist', { d1: 'chart' }))
    // The chart learns from the 11:10 note; Grace learns by seeing supper, then tells the evening RPN.
    expect(v.people.find((p) => p.id === 'record')!.since).toBe(11 * 60 + 10)
    expect(v.people.find((p) => p.id === 'eve_rpn')!.since).toBe(19 * 60)
  })

  it('the time window is fixed per scenario, so it never hints at what comes next', () => {
    const a = buildView(evelyn, runToStop(evelyn, start(evelyn, 'persist'))).window
    const b = buildView(evelyn, runToStop(evelyn, start(evelyn, 'resolve'))).window
    expect({ ...a, now: 0 }).toEqual({ ...b, now: 0 })
    expect(a.end).toBe(1440 + 15 * 60)
  })

  it('maps every choice to where it leads, per course', () => {
    const m = scenarioMap(evelyn, 'persist')
    const d1 = m.edges.filter((e) => e.from === 'mon_morning')
    expect(d1.map((e) => e.to).sort()).toEqual(['mon_told_persist', 'mon_told_persist', 'mon_untold_persist', 'mon_untold_persist'])
    expect(m.nodes.find((n) => n.id === 'tue_persist')!.depth).toBe(2)
    expect(m.nodes.every((n) => n.facts.length > 0)).toBe(true)
    const r = scenarioMap(evelyn, 'resolve')
    expect(r.nodes.some((n) => n.id === 'tue_resolve')).toBe(true)
    expect(r.nodes.some((n) => n.id === 'tue_persist')).toBe(false)
  })
})
