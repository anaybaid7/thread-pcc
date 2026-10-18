import type {
  AttemptState,
  DecisionInput,
  DecisionPoint,
  DecisionRecord,
  HandoverDraft,
  HandoverRecord,
  Scenario,
  ScenarioEvent,
  ScoreLine,
  Tag,
} from './types'
import { EngineError, node, nodeEvents, resolveNext, when } from './core'
import { handoverFacts, validateDraft } from './handover'
import { scoreHandover } from './scoring'

/**
 * The simulation engine: a pure, deterministic interpreter of scenario data. The same scenario, state and input always
 * produce the same next state. It never looks ahead: a decision is scored from the player's input and the decision
 * point alone, and records the event ids revealed at that moment as its evidence.
 */

const TAGS: Tag[] = ['observed', 'assumption', 'unknown']

export function start(s: Scenario, course: string = s.defaultCourse): AttemptState {
  if (!s.courses.some((c) => c.id === course)) throw new EngineError('invalid', `Unknown course "${course}"`)
  return {
    scenarioId: s.id,
    version: s.version,
    course,
    phase: 'prebrief',
    nodeId: s.start,
    cursor: 0,
    revealed: [],
    path: [s.start],
    decisions: [],
  }
}

/** Work out the phase from where the attempt is. */
function settle(s: Scenario, st: AttemptState) {
  const n = node(s, st.nodeId)
  if (st.cursor < nodeEvents(s, st, n.id).length) st.phase = 'playing'
  else if (n.decision && !st.decisions.some((d) => d.decisionId === n.decision!.id)) st.phase = 'decision'
  else if (n.handover) st.phase = st.handover ? 'complete' : 'handover'
  else st.phase = 'playing'
}

export function canAdvance(s: Scenario, st: AttemptState): boolean {
  if (st.phase === 'prebrief') return true
  if (st.phase !== 'playing') return false
  const n = node(s, st.nodeId)
  return st.cursor < nodeEvents(s, st, n.id).length || n.next !== undefined
}

/** Reveal exactly one event. Nothing moves unless the player asks. */
export function advance(s: Scenario, st: AttemptState): { state: AttemptState; event: ScenarioEvent } {
  if (!canAdvance(s, st)) throw new EngineError('not_now', `Can't advance while ${st.phase === 'decision' ? 'a decision is waiting' : st.phase}`)
  const next = structuredClone(st)
  next.phase = 'playing'
  let n = node(s, next.nodeId)
  let events = nodeEvents(s, next, n.id)
  while (next.cursor >= events.length) {
    if (n.next === undefined) throw new EngineError('not_now', 'Nothing left to reveal')
    const to = resolveNext(n.next, next.course)
    next.nodeId = to
    next.cursor = 0
    next.path.push(to)
    n = node(s, to)
    events = nodeEvents(s, next, n.id)
  }
  const event = events[next.cursor]!
  next.cursor += 1
  next.revealed.push(event.id)
  settle(s, next)
  return { state: next, event }
}

export function pendingDecision(s: Scenario, st: AttemptState): DecisionPoint | null {
  if (st.phase !== 'decision') return null
  return node(s, st.nodeId).decision ?? null
}

function checkInput(dp: DecisionPoint, input: DecisionInput): DecisionInput {
  const choice = dp.choices.find((c) => c.id === input.choice)
  if (!choice) throw new EngineError('invalid', 'Choose one of the actions')
  const ids = new Set(dp.recognition.options.map((o) => o.id))
  const recognition = [...new Set(input.recognition)].sort()
  if (recognition.some((r) => !ids.has(r))) throw new EngineError('invalid', 'Unknown recognition option')
  if (dp.recognition.kind === 'trend' && recognition.length !== 1) throw new EngineError('invalid', 'Pick one description of the trend')
  const tags: Record<string, Tag> = {}
  for (const st of dp.statements) {
    const t = input.tags[st.id]
    if (!t || !TAGS.includes(t)) throw new EngineError('invalid', 'Sort every statement as observed, assumption or unknown')
    tags[st.id] = t
  }
  if (Object.keys(input.tags).some((k) => !(k in tags))) throw new EngineError('invalid', 'Unknown statement')
  return { recognition, tags, choice: choice.id }
}

const TAG_WORD: Record<Tag, string> = { observed: 'an observation', assumption: 'an assumption', unknown: 'unknown' }

function list(xs: string[]) {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/** The rubric for one decision, as explicit rules. Uses only the decision point and the player's input. */
export function scoreDecision(s: Scenario, dp: DecisionPoint, input: DecisionInput): ScoreLine[] {
  const at = when(s, dp.at)
  const lines: ScoreLine[] = []
  const r = dp.recognition
  const picked = new Set(input.recognition)
  if (r.kind === 'dimensions') {
    const hits = r.options.filter((o) => o.changed && picked.has(o.id))
    const missed = r.options.filter((o) => o.changed && !picked.has(o.id))
    const wrong = r.options.filter((o) => !o.changed && picked.has(o.id))
    const earned = Math.max(0, Math.min(r.max, hits.length * r.pointsPerHit - wrong.length * r.penaltyPerFalse))
    const parts = [hits.length ? `Spotted ${list(hits.map((h) => h.label.toLowerCase()))}.` : 'No change identified.']
    for (const m of missed) parts.push(`Missed ${m.label.toLowerCase()}: ${m.why}`)
    for (const w of wrong) parts.push(`${w.label} isn’t supported: ${w.why}`)
    lines.push({ criterion: 'recognition', item: `${at} · What changed`, earned, max: r.max, reason: parts.join(' ') })
  } else {
    const o = r.options.find((x) => picked.has(x.id))!
    lines.push({ criterion: 'recognition', item: `${at} · The trend`, earned: o.points, max: r.max, reason: `“${o.label}”. ${o.why}` })
  }

  const choice = dp.choices.find((c) => c.id === input.choice)!
  lines.push({
    criterion: 'communication',
    item: `${at} · What you did`,
    earned: choice.communication,
    max: dp.communicationMax,
    reason: `“${choice.label}”. ${choice.feedback}`,
  })

  const wrong = dp.statements.filter((x) => input.tags[x.id] !== x.answer)
  lines.push({
    criterion: 'evidence',
    item: `${at} · Fact, assumption or unknown`,
    earned: (dp.statements.length - wrong.length) * dp.pointsPerStatement,
    max: dp.statements.length * dp.pointsPerStatement,
    reason: wrong.length
      ? wrong.map((x) => `“${x.text}” is ${TAG_WORD[x.answer]}, not ${TAG_WORD[input.tags[x.id]!]}: ${x.why}`).join(' ')
      : `All ${dp.statements.length} statements sorted correctly.`,
  })
  return lines
}

export function decide(
  s: Scenario,
  st: AttemptState,
  decisionId: string,
  raw: DecisionInput,
): { state: AttemptState; record: DecisionRecord } {
  const dp = pendingDecision(s, st)
  if (!dp) throw new EngineError('not_now', 'No decision is waiting')
  if (dp.id !== decisionId) throw new EngineError('not_now', 'That decision is not the one waiting')
  const input = checkInput(dp, raw)
  const record: DecisionRecord = {
    decisionId: dp.id,
    nodeId: st.nodeId,
    at: dp.at,
    input,
    evidence: [...st.revealed],
    lines: scoreDecision(s, dp, input),
  }
  const next = structuredClone(st)
  next.decisions.push(record)
  const choice = dp.choices.find((c) => c.id === input.choice)!
  next.nodeId = resolveNext(choice.next, next.course)
  next.cursor = 0
  next.path.push(next.nodeId)
  settle(s, next)
  return { state: next, record }
}

export function submitHandover(
  s: Scenario,
  st: AttemptState,
  draft: HandoverDraft,
  startedFrom: HandoverRecord['startedFrom'],
): { state: AttemptState; record: HandoverRecord } {
  if (st.phase !== 'handover') throw new EngineError('not_now', 'The handover is not open yet')
  const facts = handoverFacts(s, st)
  const { errors } = validateDraft(draft, facts, { strict: false })
  if (errors.length) throw new EngineError('invalid', errors.join(' '))
  const record: HandoverRecord = { draft, startedFrom, lines: scoreHandover(s, st, draft, facts) }
  const next = structuredClone(st)
  next.handover = record
  next.phase = 'complete'
  return { state: next, record }
}

/** Every score line so far, in order. */
export function scoreLines(st: AttemptState): ScoreLine[] {
  return [...st.decisions.flatMap((d) => d.lines), ...(st.handover?.lines ?? [])]
}
