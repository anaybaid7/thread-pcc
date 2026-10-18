import { AREAS, MEASURES, type Area, type Command, type Event, type MeasureKind, type Resident, type Sbar, type Ward } from './model'
import { RESIDENTS, STAFF } from './seed'

/**
 * The ward engine: applies commands as events and derives every view from the event log. Deterministic: the same log
 * always gives the same screens. No risk scores: every flag is an explicit rule with a reason a person can check.
 */

export class WardError extends Error {}

const STEP = 2 // minutes each action takes on the demo clock
const SHIFT_CHANGES = [7 * 60, 15 * 60, 23 * 60]
const HANDOVER_BEFORE = 30
const HANDOVER_AFTER = 60
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu']

export const clock = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
export const when = (t: number) => `${DAYS[Math.floor(t / 1440)] ?? ''} ${clock(t)}`
export const shiftOf = (t: number): 'day' | 'evening' | 'night' => {
  const m = t % 1440
  return m >= 420 && m < 900 ? 'day' : m >= 900 && m < 1380 ? 'evening' : 'night'
}
/** The handover that is current at t: the shift change just past (for an hour after it), otherwise the next one. */
export function nextHandover(t: number) {
  const day = Math.floor(t / 1440) * 1440
  const changes = [day - 1440, day, day + 1440].flatMap((d) => SHIFT_CHANGES.map((h) => d + h))
  const recent = changes.filter((c) => c <= t && t - c <= HANDOVER_AFTER).pop()
  return recent ?? changes.find((c) => c >= t)!
}

export const resident = (id: string) => {
  const r = RESIDENTS.find((x) => x.id === id)
  if (!r) throw new WardError(`No resident "${id}"`)
  return r
}
export const staffName = (id: string) => STAFF.find((s) => s.id === id)?.name ?? id
const her = (r: Resident) => (r.pronoun === 'she' ? 'her' : 'his')

// ── Readings against the person's own usual ────────────────────────────────

export interface Reading {
  text: string
  inUsual: boolean
}

export function compare(r: Resident, kind: MeasureKind, value: number | string, at: number): Reading {
  const m = MEASURES[kind]
  if (kind === 'temp' || kind === 'pulse' || kind === 'sbp' || kind === 'spo2') {
    const range = r.vitals[kind]
    const n = Number(value)
    const where = n < range.lo ? 'below' : n > range.hi ? 'above' : 'within'
    return { text: `${n}${m.unit === '%' ? '%' : ` ${m.unit}`}, ${where} ${her(r)} usual ${range.lo} to ${range.hi}`, inUsual: where === 'within' }
  }
  if (kind === 'fluids') {
    const minute = at % 1440
    const share = Math.min(1, Math.max(0.05, (minute - 420) / 840))
    const expected = Math.round((r.fluids * share) / 50) * 50
    const pct = expected ? Math.round((Number(value) / expected) * 100) : 100
    return { text: `${value} mL, about ${pct}% of ${her(r)} usual by ${clock(at)} (around ${expected} mL)`, inUsual: pct >= 75 }
  }
  if (kind === 'pain') return { text: `Pain ${value}/10`, inUsual: Number(value) <= 2 }
  return { text: String(value), inUsual: value === 'Walked as usual' || value === 'As usual' }
}

// ── Commands ───────────────────────────────────────────────────────────────

const LIMITS: Partial<Record<MeasureKind, [number, number]>> = { temp: [33, 43], pulse: [30, 200], sbp: [60, 250], spo2: [70, 100], fluids: [0, 5000], pain: [0, 10] }

export function apply(w: Ward, cmd: Command): Ward {
  const next: Ward = { now: w.now, events: [...w.events] }
  const id = () => `e${next.events.length + 1}`
  const at = w.now
  const push = (e: Event) => next.events.push(e)
  const view = deriveConcerns(w)

  switch (cmd.type) {
    case 'checkin': {
      const r = resident(cmd.residentId)
      const areas = Object.keys(r.usual) as Area[]
      const by = new Map(cmd.findings.map((f) => [f.area, f]))
      if (cmd.findings.some((f) => !areas.includes(f.area))) throw new WardError('That area is not part of this resident’s usual')
      const observed: string[] = []
      for (const area of areas) {
        const f = by.get(area)
        if (!f || f.status === 'unchecked') continue
        if (f.status === 'different' && !f.finding?.trim()) throw new WardError(`Say what was different about ${AREAS[area].label.toLowerCase()}`)
        const e: Event = {
          type: 'observe',
          id: id(),
          at,
          by: cmd.by,
          residentId: r.id,
          area,
          usual: f.status === 'usual',
          finding: f.status === 'usual' ? 'As usual' : f.finding!.trim().slice(0, 160),
          // The resident's words belong to the report once, not to every area.
          ...(f.status === 'different' && !observed.length && cmd.quote?.trim() ? { quote: cmd.quote.trim().slice(0, 200) } : {}),
        }
        push(e)
        if (f.status === 'different') observed.push(e.id)
      }
      if (!next.events.slice(w.events.length).length) throw new WardError('Mark at least one area')
      const unknown = areas.filter((a) => !by.has(a) || by.get(a)!.status === 'unchecked')
      if (observed.length) push({ type: 'report', id: id(), at, by: cmd.by, residentId: r.id, observed, unknown })
      break
    }
    case 'measure': {
      const r = resident(cmd.residentId)
      const m = MEASURES[cmd.kind]
      if (!m) throw new WardError('Unknown check')
      if (m.choices) {
        if (!m.choices.includes(String(cmd.value))) throw new WardError('Pick one of the options')
      } else {
        const n = Number(cmd.value)
        const [lo, hi] = LIMITS[cmd.kind]!
        if (!Number.isFinite(n) || n < lo || n > hi) throw new WardError(`${m.label} must be between ${lo} and ${hi}`)
      }
      push({ type: 'measure', id: id(), at, by: cmd.by, residentId: r.id, kind: cmd.kind, value: m.choices ? String(cmd.value) : Number(cmd.value) })
      break
    }
    case 'plan': {
      const c = view.find((x) => x.id === cmd.concernId)
      if (!c || c.status === 'resolved') throw new WardError('No open concern to plan for')
      if (cmd.recheckIn < 30 || cmd.recheckIn > 720) throw new WardError('Recheck between 30 minutes and 12 hours')
      if (!cmd.recheck.length) throw new WardError('Say what to recheck')
      if (cmd.decision === 'escalate' && !cmd.to) throw new WardError('Say who it is escalated to')
      push({ type: 'plan', id: id(), at, by: cmd.by, concernId: c.id, decision: cmd.decision, recheckAt: at + cmd.recheckIn, recheck: cmd.recheck, ...(cmd.to ? { to: cmd.to } : {}), ...(cmd.sbar ? { sbar: cmd.sbar } : {}) })
      break
    }
    case 'open': {
      resident(cmd.residentId)
      if (view.some((c) => c.residentId === cmd.residentId && c.status !== 'resolved')) throw new WardError('There is already an open concern')
      push({ type: 'open', id: id(), at, by: cmd.by, residentId: cmd.residentId, reason: cmd.reason.slice(0, 200) })
      break
    }
    case 'resolve': {
      const c = view.find((x) => x.id === cmd.concernId)
      if (!c || c.status === 'resolved') throw new WardError('No open concern to close')
      if (!c.closable.ok) throw new WardError(`Can’t close yet: no outcome recorded for ${c.closable.missing.map((a) => AREAS[a].label.toLowerCase()).join(', ')}`)
      push({ type: 'resolve', id: id(), at, by: cmd.by, concernId: c.id, evidence: c.closable.evidence })
      break
    }
    case 'ack': {
      const h = handover(w)
      if (!h.open) throw new WardError(`The handover opens at ${clock(h.at - HANDOVER_BEFORE)}`)
      const item = h.items.find((i) => i.key === cmd.key)
      if (!item) throw new WardError('Not on this handover')
      if (item.ack) throw new WardError('Already acknowledged')
      push({ type: 'ack', id: id(), at, by: cmd.by, key: cmd.key, handoverAt: h.at })
      break
    }
    case 'advance': {
      if (cmd.to <= w.now || cmd.to > w.now + 1440) throw new WardError('Move the clock forward, by up to a day')
      next.now = cmd.to
      return next
    }
  }
  next.now = at + STEP
  return next
}

export const applyAll = (w: Ward, cmds: Command[]) => cmds.reduce(apply, w)

// ── Concerns ───────────────────────────────────────────────────────────────

export type Status = 'new' | 'watching' | 'escalated' | 'resolved'

export interface Concern {
  id: string
  residentId: string
  status: Status
  openedAt: number
  openedBy: string
  reason: string | null
  changed: { id: string; area: Area; finding: string; at: number; by: string; quote?: string }[]
  unknown: Area[]
  checks: { id: string; at: number; by: string; kind: MeasureKind; value: number | string; reading: Reading }[]
  followups: { id: string; at: number; by: string; area: Area; usual: boolean; finding: string }[]
  plans: Extract<Event, { type: 'plan' }>[]
  resolution: Extract<Event, { type: 'resolve' }> | null
  overdue: boolean
  closable: { ok: boolean; missing: Area[]; evidence: string[] }
}

export function deriveConcerns(w: Ward): Concern[] {
  const out: Concern[] = []
  const byId = new Map(w.events.map((e) => [e.id, e]))
  const openFor = (rid: string) => out.find((c) => c.residentId === rid && c.status !== 'resolved')
  for (const e of w.events) {
    if (e.type === 'report' || e.type === 'open') {
      let c = openFor(e.residentId)
      if (!c) {
        c = {
          id: e.id,
          residentId: e.residentId,
          status: 'new',
          openedAt: e.at,
          openedBy: e.by,
          reason: e.type === 'open' ? e.reason : null,
          changed: [],
          unknown: [],
          checks: [],
          followups: [],
          plans: [],
          resolution: null,
          overdue: false,
          closable: { ok: false, missing: [], evidence: [] },
        }
        out.push(c)
      }
      if (e.type === 'report') {
        for (const oid of e.observed) {
          const o = byId.get(oid)
          if (o?.type === 'observe') c.changed.push({ id: o.id, area: o.area, finding: o.finding, at: o.at, by: o.by, ...(o.quote ? { quote: o.quote } : {}) })
        }
        c.unknown = [...new Set([...c.unknown, ...e.unknown])].filter((a) => !c!.changed.some((x) => x.area === a))
      } else if (e.reason.toLowerCase().includes('fluid')) c.unknown = [...new Set([...c.unknown, 'drinking' as Area])]
    } else if (e.type === 'measure') {
      const c = openFor(e.residentId)
      if (c) {
        const area = MEASURES[e.kind].area
        c.checks.push({ id: e.id, at: e.at, by: e.by, kind: e.kind, value: e.value, reading: compare(resident(e.residentId), e.kind, e.value, e.at) })
        if (area) c.unknown = c.unknown.filter((a) => a !== area)
      }
    } else if (e.type === 'observe') {
      const c = openFor(e.residentId)
      // Observations made after the concern opened, outside a report, are follow-ups.
      if (c && !c.changed.some((x) => x.id === e.id)) {
        const inReport = w.events.some((x) => x.type === 'report' && x.observed.includes(e.id))
        if (!inReport) {
          c.followups.push({ id: e.id, at: e.at, by: e.by, area: e.area, usual: e.usual, finding: e.finding })
          c.unknown = c.unknown.filter((a) => a !== e.area)
        }
      }
    } else if (e.type === 'plan') {
      const c = out.find((x) => x.id === e.concernId)
      if (c) {
        c.plans.push(e)
        c.status = e.decision === 'escalate' ? 'escalated' : 'watching'
      }
    } else if (e.type === 'resolve') {
      const c = out.find((x) => x.id === e.concernId)
      if (c) {
        c.resolution = e
        c.status = 'resolved'
      }
    }
  }
  for (const c of out) {
    const plan = c.plans[c.plans.length - 1]
    if (plan && c.status !== 'resolved') {
      const rechecked = [...c.checks, ...c.followups].some((x) => x.at > plan.at)
      c.overdue = w.now > plan.recheckAt && !rechecked
    }
    // A concern closes only when every changed area has a later outcome back to usual.
    const areas = [...new Set(c.changed.map((x) => x.area).concat(c.reason ? (['drinking'] as Area[]) : []))]
    const evidence: string[] = []
    const missing: Area[] = []
    for (const a of areas) {
      const lastChange = Math.max(c.openedAt, ...c.changed.filter((x) => x.area === a).map((x) => x.at))
      const back =
        c.followups.find((f) => f.area === a && f.usual && f.at >= lastChange) ??
        c.checks.find((k) => MEASURES[k.kind].area === a && k.reading.inUsual && k.at >= lastChange)
      if (back) evidence.push(back.id)
      else missing.push(a)
    }
    c.closable = { ok: missing.length === 0 && areas.length > 0, missing, evidence }
  }
  return out
}

// ── Offered, nothing recorded ──────────────────────────────────────────────

export interface OfferFlag {
  residentId: string
  count: number
  first: number
  last: number
}

/** Two or more "offered" entries since the last measured amount: an attempt is not an outcome. */
export function offerFlags(w: Ward, concerns = deriveConcerns(w)): OfferFlag[] {
  const flags: OfferFlag[] = []
  for (const r of RESIDENTS) {
    const lastMeasure = Math.max(-1, ...w.events.filter((e) => e.type === 'measure' && e.residentId === r.id && e.kind === 'fluids').map((e) => e.at))
    const offers = w.events.filter((e) => e.type === 'offer' && e.residentId === r.id && e.at > lastMeasure)
    const covered = concerns.some((c) => c.residentId === r.id && c.status !== 'resolved')
    if (offers.length >= 2 && !covered) flags.push({ residentId: r.id, count: offers.length, first: offers[0]!.at, last: offers[offers.length - 1]!.at })
  }
  return flags
}

// ── The nurse's board ──────────────────────────────────────────────────────

export interface BoardItem {
  key: string
  residentId: string
  concernId: string | null
  rank: number
  reason: string
  detail: string
  tone: 'urgent' | 'attention' | 'routine' | 'done'
}

export function board(w: Ward): BoardItem[] {
  const concerns = deriveConcerns(w)
  const items: BoardItem[] = []
  for (const c of concerns) {
    const plan = c.plans[c.plans.length - 1]
    const areas = [...new Set(c.changed.map((x) => AREAS[x.area].label.toLowerCase()))]
    if (c.status === 'resolved') {
      if (w.now - c.resolution!.at < 1440) items.push({ key: c.id, residentId: c.residentId, concernId: c.id, rank: 9, reason: 'Closed with outcome', detail: `${when(c.resolution!.at)} by ${staffName(c.resolution!.by)}`, tone: 'done' })
    } else if (c.overdue && plan) {
      items.push({ key: c.id, residentId: c.residentId, concernId: c.id, rank: 1, reason: 'Recheck overdue', detail: `Due ${when(plan.recheckAt)}: ${plan.recheck.map((a) => AREAS[a].label.toLowerCase()).join(', ')}`, tone: 'urgent' })
    } else if (c.status === 'new') {
      const wait = w.now - c.openedAt
      items.push({
        key: c.id,
        residentId: c.residentId,
        concernId: c.id,
        rank: 2,
        reason: 'Not yet seen by a nurse',
        detail: `${c.changed.length ? `${areas.length} area${areas.length === 1 ? '' : 's'} changed: ${areas.join(', ')}` : (c.reason ?? '')} · ${staffName(c.openedBy)}, ${wait} min ago`,
        tone: wait >= 30 ? 'urgent' : 'attention',
      })
    } else {
      items.push({
        key: c.id,
        residentId: c.residentId,
        concernId: c.id,
        rank: 4,
        reason: c.status === 'escalated' ? `Escalated to ${staffName(plan!.to ?? '')}` : 'Watching',
        detail: `Recheck ${clock(plan!.recheckAt)}: ${plan!.recheck.map((a) => AREAS[a].label.toLowerCase()).join(', ')}`,
        tone: 'routine',
      })
    }
  }
  for (const f of offerFlags(w, concerns))
    items.push({ key: `offers:${f.residentId}`, residentId: f.residentId, concernId: null, rank: 3, reason: 'Offered, nothing recorded', detail: `Fluids offered ${f.count} times since ${when(f.first)}, no amount`, tone: 'attention' })
  return items.sort((a, b) => a.rank - b.rank || a.residentId.localeCompare(b.residentId))
}

// ── Shift-change handover ──────────────────────────────────────────────────

export interface HandoverItem {
  key: string
  residentId: string
  group: 'action' | 'open' | 'closed'
  status: Status | 'offers'
  headline: string
  done: string[]
  pending: string[]
  unknown: string[]
  ack: { by: string; at: number } | null
}

export interface Handover {
  at: number
  label: string
  from: 'day' | 'evening' | 'night'
  /** Acknowledgements are taken from 30 minutes before the shift change to an hour after. */
  open: boolean
  items: HandoverItem[]
}

export function handover(w: Ward): Handover {
  const at = nextHandover(w.now)
  const concerns = deriveConcerns(w)
  const acks = new Map(w.events.filter((e): e is Extract<Event, { type: 'ack' }> => e.type === 'ack' && e.handoverAt === at).map((e) => [e.key, { by: e.by, at: e.at }]))
  const items: HandoverItem[] = []
  for (const c of concerns) {
    const r = resident(c.residentId)
    const plan = c.plans[c.plans.length - 1]
    const changes = c.changed.map((x) => x.finding.toLowerCase())
    if (c.status === 'resolved') {
      if (c.resolution!.at < at - 480 || c.resolution!.at > at) continue
      items.push({
        key: c.id,
        residentId: r.id,
        group: 'closed',
        status: 'resolved',
        headline: `Back to ${her(r)} usual: ${changes.join('; ') || c.reason}`,
        done: [`Closed ${when(c.resolution!.at)} by ${staffName(c.resolution!.by)} on a recorded outcome`],
        pending: [],
        unknown: [],
        ack: acks.get(c.id) ?? null,
      })
      continue
    }
    const done: string[] = [`Reported ${when(c.openedAt)} by ${staffName(c.openedBy)}`]
    for (const k of c.checks) done.push(`${MEASURES[k.kind].label} ${k.reading.text}`)
    for (const f of c.followups) done.push(`${AREAS[f.area].label}: ${f.finding.toLowerCase()} (${clock(f.at)})`)
    if (plan) done.push(`${plan.decision === 'escalate' ? `Escalated to ${staffName(plan.to ?? '')}` : 'Watch plan'} by ${staffName(plan.by)} at ${clock(plan.at)}`)
    const pending: string[] = []
    if (c.status === 'new') pending.push('Not yet seen by a nurse')
    if (plan && c.overdue) pending.push(`Recheck overdue since ${when(plan.recheckAt)}: ${plan.recheck.map((a) => AREAS[a].label.toLowerCase()).join(', ')}`)
    else if (plan) pending.push(`Recheck ${when(plan.recheckAt)}: ${plan.recheck.map((a) => AREAS[a].label.toLowerCase()).join(', ')}`)
    if (!c.closable.ok && c.closable.missing.length) pending.push(`No outcome yet for ${c.closable.missing.map((a) => AREAS[a].label.toLowerCase()).join(', ')}`)
    items.push({
      key: c.id,
      residentId: r.id,
      group: c.status === 'new' || c.overdue ? 'action' : 'open',
      status: c.status,
      headline: changes.length ? changes.join('; ') : (c.reason ?? 'Concern'),
      done,
      pending,
      unknown: c.unknown.map((a) => AREAS[a].label),
      ack: acks.get(c.id) ?? null,
    })
  }
  for (const f of offerFlags(w, concerns))
    items.push({
      key: `offers:${f.residentId}`,
      residentId: f.residentId,
      group: 'action',
      status: 'offers',
      headline: `Fluids offered ${f.count} times, no amount recorded`,
      done: [`Offered ${when(f.first)} to ${when(f.last)}`],
      pending: ['Measure what is actually drunk'],
      unknown: ['How much was drunk'],
      ack: acks.get(`offers:${f.residentId}`) ?? null,
    })
  const order = { action: 0, open: 1, closed: 2 }
  items.sort((a, b) => order[a.group] - order[b.group] || a.residentId.localeCompare(b.residentId))
  return { at, label: when(at), from: shiftOf(at - 1), open: w.now >= at - HANDOVER_BEFORE && w.now <= at + HANDOVER_AFTER, items }
}

// ── SBAR, built only from recorded facts ───────────────────────────────────

export interface Fact {
  id: string
  text: string
}

export function sbarFacts(w: Ward, concernId: string): Fact[] {
  const c = deriveConcerns(w).find((x) => x.id === concernId)
  if (!c) throw new WardError('No such concern')
  const r = resident(c.residentId)
  const facts: Fact[] = [{ id: 'who', text: `${r.name}, ${r.age}, room ${r.room}` }]
  for (const a of new Set([...c.changed.map((x) => x.area), ...c.unknown])) if (r.usual[a]) facts.push({ id: `usual-${a}`, text: `Usually: ${r.usual[a]}` })
  for (const x of c.changed) facts.push({ id: x.id, text: `${when(x.at)} ${AREAS[x.area].label}: ${x.finding}${x.quote ? ` (“${x.quote}”)` : ''}, reported by ${staffName(x.by)}` })
  for (const k of c.checks) facts.push({ id: k.id, text: `${when(k.at)} ${MEASURES[k.kind].label}: ${k.reading.text}` })
  for (const f of c.followups) facts.push({ id: f.id, text: `${when(f.at)} ${AREAS[f.area].label}: ${f.finding}` })
  for (const a of c.unknown) facts.push({ id: `unknown-${a}`, text: `Not yet known: ${AREAS[a].label.toLowerCase()}` })
  return facts
}

export function templateSbar(w: Ward, concernId: string): Sbar {
  const c = deriveConcerns(w).find((x) => x.id === concernId)!
  const r = resident(c.residentId)
  const changed = c.changed.map((x) => x.finding.toLowerCase())
  const outside = c.checks.filter((k) => !k.reading.inUsual)
  return {
    situation: `${r.name}, room ${r.room}: ${changed.length ? changed.join(', ') : c.reason} since ${when(c.openedAt)}.`,
    background: (Object.entries(r.usual) as [Area, string][])
      .filter(([a]) => c.changed.some((x) => x.area === a) || c.unknown.includes(a))
      .map(([, u]) => `Usually: ${u}.`)
      .join(' '),
    assessment: [...c.checks.map((k) => `${MEASURES[k.kind].label} ${k.reading.text}.`), ...(c.unknown.length ? [`Not yet known: ${c.unknown.map((a) => AREAS[a].label.toLowerCase()).join(', ')}.`] : [])].join(' ') || 'No checks recorded yet.',
    recommendation: outside.length
      ? `Please assess ${r.preferred} today. Tell me what to monitor and how often.`
      : `Please review ${r.preferred} and advise whether to keep watching or assess today.`,
    source: 'template',
  }
}

// ── The relay: where each concern is between the person who noticed and a recorded outcome ──

export type StageKey = 'noticed' | 'seen' | 'plan' | 'handover' | 'closed'
export const STAGES: { key: StageKey; label: string }[] = [
  { key: 'noticed', label: 'Noticed' },
  { key: 'seen', label: 'Seen by a nurse' },
  { key: 'plan', label: 'Plan' },
  { key: 'handover', label: 'Handed over' },
  { key: 'closed', label: 'Closed on outcome' },
]

export interface Stage {
  key: StageKey
  /** done: happened. stuck: the baton is held here. missed: a step that should have happened and didn't. later: not reached. */
  state: 'done' | 'stuck' | 'missed' | 'later'
  at: number | null
  by: string | null
  text: string
}

export interface Lane {
  key: string
  residentId: string
  concernId: string | null
  stages: Stage[]
  /** Where the baton is held, in words, and since when. Null when it is moving or closed. */
  stuck: { stage: StageKey; text: string; since: number } | null
  closed: boolean
}

const NURSES = new Set(STAFF.filter((s) => s.role === 'RPN' || s.role === 'NP').map((s) => s.id))
const mins = (n: number) => (n < 90 ? `${n} min` : `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`)

/** Shift changes strictly after `from` and no later than `to`. */
function changesBetween(from: number, to: number) {
  const out: number[] = []
  for (let d = Math.floor(from / 1440) * 1440; d <= to; d += 1440) for (const h of SHIFT_CHANGES) if (d + h > from && d + h <= to) out.push(d + h)
  return out
}

export function relay(w: Ward): Lane[] {
  const concerns = deriveConcerns(w)
  const h = handover(w)
  const acks = w.events.filter((e): e is Extract<Event, { type: 'ack' }> => e.type === 'ack')
  const lanes: Lane[] = []
  const handoverStage = (key: string, opened: number, until: number): Stage => {
    const a = acks.filter((x) => x.key === key).pop()
    if (a) return { key: 'handover', state: 'done', at: a.at, by: a.by, text: `Taken on by ${staffName(a.by)}` }
    const onSheet = h.open && h.items.some((i) => i.key === key)
    if (onSheet) return { key: 'handover', state: 'stuck', at: null, by: null, text: `On the ${clock(h.at)} handover, not taken on` }
    const crossed = changesBetween(opened, until).filter((c) => !(h.open && c === h.at))
    if (crossed.length) return { key: 'handover', state: 'missed', at: null, by: null, text: `${crossed.length} shift change${crossed.length === 1 ? '' : 's'}, no sign-off` }
    return { key: 'handover', state: 'later', at: null, by: null, text: `Next ${clock(nextHandover(w.now))}` }
  }

  for (const c of concerns) {
    if (c.status === 'resolved' && w.now - c.resolution!.at >= 1440) continue
    const plan = c.plans[c.plans.length - 1]
    const firstNurse = [...c.checks, ...c.followups.filter((f) => NURSES.has(f.by)), ...c.plans].filter((x) => NURSES.has(x.by)).sort((a, b) => a.at - b.at)[0]
    const noticed: Stage = { key: 'noticed', state: 'done', at: c.openedAt, by: c.openedBy, text: c.changed.length ? c.changed.map((x) => x.finding).join(', ') : (c.reason ?? 'Concern opened') }
    const seen: Stage = firstNurse
      ? { key: 'seen', state: 'done', at: firstNurse.at, by: firstNurse.by, text: `${staffName(firstNurse.by)}, after ${mins(firstNurse.at - c.openedAt)}` }
      : { key: 'seen', state: 'stuck', at: null, by: null, text: `Waiting ${mins(w.now - c.openedAt)}` }
    const planStage: Stage = !plan
      ? { key: 'plan', state: 'later', at: null, by: null, text: firstNurse ? 'Needs a decision' : '' }
      : c.overdue
        ? { key: 'plan', state: 'stuck', at: plan.at, by: plan.by, text: `Recheck overdue ${mins(w.now - plan.recheckAt)}` }
        : { key: 'plan', state: 'done', at: plan.at, by: plan.by, text: plan.decision === 'escalate' ? `Escalated to ${staffName(plan.to ?? '')}` : `Watching, recheck ${clock(plan.recheckAt)}` }
    const closed: Stage = c.resolution
      ? { key: 'closed', state: 'done', at: c.resolution.at, by: c.resolution.by, text: 'Back to usual' }
      : { key: 'closed', state: 'later', at: null, by: null, text: c.closable.missing.length ? `Needs outcome: ${c.closable.missing.map((a) => AREAS[a].label.toLowerCase()).join(', ')}` : '' }
    const stages = [noticed, seen, planStage, handoverStage(c.id, c.openedAt, c.resolution?.at ?? w.now), closed]
    const s = stages.find((x) => x.state === 'stuck')
    lanes.push({
      key: c.id,
      residentId: c.residentId,
      concernId: c.id,
      stages,
      stuck: s ? { stage: s.key, text: s.text, since: s.key === 'seen' ? c.openedAt : s.key === 'plan' ? plan!.recheckAt : h.at - HANDOVER_BEFORE } : null,
      closed: !!c.resolution,
    })
  }
  for (const f of offerFlags(w, concerns)) {
    const key = `offers:${f.residentId}`
    const later = (k: StageKey): Stage => ({ key: k, state: 'later', at: null, by: null, text: '' })
    lanes.push({
      key,
      residentId: f.residentId,
      concernId: null,
      stages: [
        { key: 'noticed', state: 'stuck', at: f.first, by: null, text: `Fluids offered ${f.count} times, never measured` },
        later('seen'),
        later('plan'),
        handoverStage(key, f.first, w.now),
        later('closed'),
      ],
      stuck: { stage: 'noticed', text: `Offered ${f.count} times, nothing measured`, since: f.first },
      closed: false,
    })
  }
  return lanes.sort((a, b) => Number(a.closed) - Number(b.closed) || (a.stuck ? a.stuck.since : Infinity) - (b.stuck ? b.stuck.since : Infinity) || a.residentId.localeCompare(b.residentId))
}
