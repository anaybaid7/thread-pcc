import { dayName, node, when } from './core'
import { canAdvance, pendingDecision, scoreLines } from './engine'
import { handoverFacts } from './handover'
import { breakdown } from './scoring'
import type {
  AttemptState,
  Flow,
  Person,
  SimTime,
  Dimension,
  DimensionDef,
  EventKind,
  Fact,
  HandoverRecord,
  Phase,
  Resident,
  Scenario,
  ScenarioEvent,
  ScoreLine,
} from './types'

/**
 * What the player sees. Built the same way by the server (live, persisted) and in the browser (practice mode).
 * A pending decision never carries its answers; the course of the day is only revealed in the debrief.
 */

export type TimelineItem =
  | {
      type: 'event'
      id: string
      /** Minutes since the start of day 1. */
      t: number
      by: string
      day: string
      clock: string
      kind: EventKind
      source: string
      text: string
      quote?: string
      fact: string
      section: string
      dims: Dimension[]
    }
  | {
      type: 'decision'
      id: string
      t: number
      day: string
      clock: string
      title: string
      choice: string
      choiceId: string
      earned: number
      max: number
      /** Event ids the decision was judged on. */
      evidence: string[]
    }

export interface Awareness extends Person {
  /** When this person first knew of the change (minutes), or null. */
  since: number | null
  how: string | null
}

export interface FlowMark extends Flow {
  t: number
  eventId: string
}

export interface ChartPoint {
  key: string
  label: string
  phase: 'usual' | 'observed'
  values: Partial<Record<Dimension, number>>
  notes: Partial<Record<Dimension, string>>
}

export interface PublicDecision {
  id: string
  title: string
  prompt: string
  clock: string
  recognition: { kind: 'dimensions' | 'trend'; prompt: string; options: { id: string; label: string }[] }
  statements: { id: string; text: string }[]
  choices: { id: string; label: string; detail: string }[]
}

export interface DecisionFeedback {
  decisionId: string
  title: string
  choice: string
  lines: ScoreLine[]
  /** What a thoughtful response looked like, given what was known then. */
  expected: string
  answers: { statement: string; answer: string; yours: string; why: string }[]
}

export interface Debrief {
  total: number
  max: number
  criteria: ReturnType<typeof breakdown>['criteria']
  course: { id: string; label: string; summary: string }
  otherCourses: { id: string; label: string; summary: string }[]
  deviations: string[]
  missing: string[]
  slips: string[]
  communication: { title: string; expected: string }[]
  alternatives: { title: string; options: { label: string; earned: number; max: number; feedback: string; chosen: boolean }[] }[]
  handover: HandoverRecord | null
  insight: string
}

export interface AttemptView {
  scenario: {
    id: string
    version: number
    title: string
    subtitle: string
    role: string
    resident: Resident
    dimensions: DimensionDef[]
  }
  phase: Phase
  stage: 'A' | 'B' | 'C' | 'handover' | 'debrief'
  now: { day: string; clock: string; label: string } | null
  canAdvance: boolean
  timeline: TimelineItem[]
  /** Time axis for the shift views: fixed per scenario, in minutes since day 1 00:00. */
  window: { start: number; end: number; now: number | null; days: string[] }
  people: Awareness[]
  flows: FlowMark[]
  chart: ChartPoint[]
  decision: PublicDecision | null
  feedback: DecisionFeedback | null
  handover: { to: string; purpose: string; facts: Fact[] } | null
  debrief: Debrief | null
}

export function minutes(t: SimTime) {
  return (t.day - 1) * 1440 + Number(t.clock.slice(0, 2)) * 60 + Number(t.clock.slice(3, 5))
}

/** Who knew about the change, and every hand-off so far, from revealed events only. */
export function awareness(s: Scenario, st: AttemptState): { people: Awareness[]; flows: FlowMark[] } {
  const idx = eventIndex(s)
  const since = new Map<string, { t: number; how: string }>()
  const flows: FlowMark[] = []
  const learn = (who: string, t: number, how: string) => {
    if (!since.has(who)) since.set(who, { t, how })
  }
  for (const id of st.revealed) {
    const { e } = idx.get(id)!
    const t = minutes(e)
    for (const who of e.aware ?? []) learn(who, t, 'saw it')
    for (const f of e.flows ?? []) {
      flows.push({ ...f, t, eventId: id })
      // A hand-off only carries knowledge the sender has.
      if (f.passed && (since.has(f.from) || f.from === 'record')) learn(f.to, t, f.note)
    }
  }
  return {
    people: s.people.map((p) => ({ ...p, since: since.get(p.id)?.t ?? null, how: since.get(p.id)?.how ?? null })),
    flows,
  }
}

function shiftOf(day: number, clock: string): { day: number; shift: 'day' | 'evening' | 'night' } {
  const h = Number(clock.slice(0, 2))
  if (h >= 7 && h < 15) return { day, shift: 'day' }
  if (h >= 15 && h < 23) return { day, shift: 'evening' }
  return { day: h < 7 ? day - 1 : day, shift: 'night' }
}

const SHIFT_WORD = { day: 'day', evening: 'eve', night: 'night' }

function eventIndex(s: Scenario) {
  const byId = new Map<string, { e: ScenarioEvent; section: string }>()
  for (const n of Object.values(s.nodes)) for (const e of n.events) byId.set(e.id, { e, section: n.label })
  return byId
}

export function chartPoints(s: Scenario, st: AttemptState): ChartPoint[] {
  const points: ChartPoint[] = s.baselineSeries.map((b, i) => ({
    key: `usual-${i}`,
    label: b.label,
    phase: 'usual',
    values: b.values,
    notes: {},
  }))
  const idx = eventIndex(s)
  const slots = new Map<string, ChartPoint>()
  for (const id of st.revealed) {
    const { e } = idx.get(id)!
    if (!e.measures) continue
    const slot = shiftOf(e.day, e.clock)
    const key = `${slot.day}-${slot.shift}`
    let p = slots.get(key)
    if (!p) {
      p = { key, label: `${dayName(s, slot.day).slice(0, 3)} ${SHIFT_WORD[slot.shift]}`, phase: 'observed', values: {}, notes: {} }
      slots.set(key, p)
    }
    for (const [d, v] of Object.entries(e.measures) as [Dimension, number][]) {
      p.values[d] = v
      p.notes[d] = `${e.clock} ${e.fact}`
    }
  }
  return [...points, ...slots.values()]
}

function timeline(s: Scenario, st: AttemptState): TimelineItem[] {
  const idx = eventIndex(s)
  const items: TimelineItem[] = []
  const decisionsAt = new Map<number, typeof st.decisions>()
  for (const d of st.decisions) decisionsAt.set(d.evidence.length, [...(decisionsAt.get(d.evidence.length) ?? []), d])
  st.revealed.forEach((id, i) => {
    const { e, section } = idx.get(id)!
    items.push({
      type: 'event',
      id,
      t: minutes(e),
      by: e.by,
      day: dayName(s, e.day),
      clock: e.clock,
      kind: e.kind,
      source: e.source,
      text: e.text,
      quote: e.quote,
      fact: e.fact,
      section,
      dims: Object.keys(e.measures ?? {}) as Dimension[],
    })
    for (const d of decisionsAt.get(i + 1) ?? []) {
      const dp = node(s, d.nodeId).decision!
      const choice = dp.choices.find((c) => c.id === d.input.choice)!
      items.push({
        type: 'decision',
        id: d.decisionId,
        t: minutes(d.at),
        evidence: d.evidence,
        day: dayName(s, d.at.day),
        clock: d.at.clock,
        title: dp.title,
        choice: choice.label,
        choiceId: choice.id,
        earned: d.lines.reduce((n, l) => n + l.earned, 0),
        max: d.lines.reduce((n, l) => n + l.max, 0),
      })
    }
  })
  return items
}

const TAG_LABEL = { observed: 'Observed', assumption: 'Assumption', unknown: 'Unknown' }

function feedbackFor(s: Scenario, st: AttemptState): DecisionFeedback | null {
  const d = st.decisions[st.decisions.length - 1]
  if (!d) return null
  const dp = node(s, d.nodeId).decision!
  return {
    decisionId: d.decisionId,
    title: dp.title,
    choice: dp.choices.find((c) => c.id === d.input.choice)!.label,
    lines: d.lines,
    expected: dp.expected,
    answers: dp.statements.map((x) => ({
      statement: x.text,
      answer: TAG_LABEL[x.answer],
      yours: TAG_LABEL[d.input.tags[x.id]!],
      why: x.why,
    })),
  }
}

export function debrief(s: Scenario, st: AttemptState): Debrief {
  const idx = eventIndex(s)
  const b = breakdown(scoreLines(st))
  const revealed = st.revealed.map((id) => idx.get(id)!.e)
  const label = (d: Dimension) => s.dimensions.find((x) => x.key === d)?.label.toLowerCase() ?? d
  const deviations = revealed
    .filter((e) => Object.values(e.measures ?? {}).some((v) => v < 85))
    .map((e) => {
      const dims = (Object.entries(e.measures ?? {}) as [Dimension, number][]).filter(([, v]) => v < 85).map(([d]) => label(d))
      return `${when(s, e)} · ${e.fact} (${dims.join(', ')} below usual)`
    })
  const slips: string[] = []
  for (const d of st.decisions) {
    const dp = node(s, d.nodeId).decision!
    for (const x of dp.statements) {
      const yours = d.input.tags[x.id]
      if (yours === 'observed' && x.answer !== 'observed') slips.push(`“${x.text}” was treated as an observation. ${x.why}`)
    }
    const c = dp.choices.find((y) => y.id === d.input.choice)!
    if (c.assumes) slips.push(`${when(s, dp.at)}: “${c.label}” presents a guess about the cause as a finding.`)
  }
  for (const l of st.handover?.lines ?? []) if (l.reason.startsWith('Lists an unknown')) slips.push(`Handover: ${l.reason}`)
  const course = s.courses.find((c) => c.id === st.course)!
  const handoverNode = Object.values(s.nodes).find((n) => n.handover && st.path.includes(n.id))
  return {
    total: b.total,
    max: b.max,
    criteria: b.criteria,
    course,
    otherCourses: s.courses.filter((c) => c.id !== st.course),
    deviations,
    missing: revealed.filter((e) => e.kind === 'unknown').map((e) => `${when(s, e)} · ${e.fact}`),
    slips,
    communication: [
      ...st.decisions.map((d) => {
        const dp = node(s, d.nodeId).decision!
        return { title: dp.title, expected: dp.expected }
      }),
      ...(handoverNode?.handover ? [{ title: 'The handover', expected: handoverNode.handover.expected }] : []),
    ],
    alternatives: st.decisions.map((d) => {
      const dp = node(s, d.nodeId).decision!
      return {
        title: dp.title,
        options: dp.choices.map((c) => ({
          label: c.label,
          earned: c.communication,
          max: dp.communicationMax,
          feedback: c.feedback,
          chosen: c.id === d.input.choice,
        })),
      }
    }),
    handover: st.handover ?? null,
    insight: s.insight,
  }
}

export function buildView(s: Scenario, st: AttemptState): AttemptView {
  const idx = eventIndex(s)
  const last = st.revealed.length ? idx.get(st.revealed[st.revealed.length - 1]!)!.e : null
  const dp = pendingDecision(s, st)
  const t = dp ? dp.at : last
  const n = node(s, st.nodeId)
  const aw = awareness(s, st)
  return {
    window: { start: minutes(s.window.start), end: minutes(s.window.end), now: t ? minutes(t) : null, days: s.days },
    people: aw.people,
    flows: aw.flows,
    scenario: {
      id: s.id,
      version: s.version,
      title: s.title,
      subtitle: s.subtitle,
      role: s.role,
      resident: s.resident,
      dimensions: s.dimensions,
    },
    phase: st.phase,
    stage: st.phase === 'prebrief' ? 'A' : st.phase === 'handover' ? 'handover' : st.phase === 'complete' ? 'debrief' : n.stage,
    now: t ? { day: dayName(s, t.day), clock: t.clock, label: `${dayName(s, t.day)} ${t.clock}` } : null,
    canAdvance: canAdvance(s, st),
    timeline: timeline(s, st),
    chart: chartPoints(s, st),
    decision: dp
      ? {
          id: dp.id,
          title: dp.title,
          prompt: dp.prompt,
          clock: when(s, dp.at),
          recognition: {
            kind: dp.recognition.kind,
            prompt: dp.recognition.prompt,
            options: dp.recognition.options.map((o) => ({ id: o.id, label: o.label })),
          },
          statements: dp.statements.map((x) => ({ id: x.id, text: x.text })),
          choices: dp.choices.map((c) => ({ id: c.id, label: c.label, detail: c.detail })),
        }
      : null,
    feedback: feedbackFor(s, st),
    handover: st.phase === 'handover' && n.handover ? { to: n.handover.to, purpose: n.handover.purpose, facts: handoverFacts(s, st) } : null,
    debrief: st.phase === 'complete' ? debrief(s, st) : null,
  }
}
