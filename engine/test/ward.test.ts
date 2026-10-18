import { describe, expect, it } from 'vitest'
import { apply, applyAll, board, deriveConcerns, handover, offerFlags, relay, sbarFacts, seedWard, START, t, templateSbar, WardError, type Command, type Ward } from '../src'

const evelynCheckin: Command = {
  type: 'checkin',
  by: 'maya',
  residentId: 'evelyn',
  findings: [
    { area: 'mobility', status: 'different', finding: 'Stayed in bed or room' },
    { area: 'eating', status: 'different', finding: 'Ate about a quarter' },
    { area: 'mood', status: 'different', finding: 'Quieter than usual' },
    { area: 'thinking', status: 'usual' },
    { area: 'drinking', status: 'unchecked' },
    { area: 'pain', status: 'unchecked' },
  ],
  quote: 'I’ll stay put a bit, dear.',
}

const concernOf = (w: Ward, rid: string) => deriveConcerns(w).find((c) => c.residentId === rid && c.status !== 'resolved')!

describe('the seeded ward', () => {
  it('starts Tuesday 10:40 with the situations the workflows need', () => {
    const w = seedWard()
    expect(w.now).toBe(START)
    const b = board(w)
    expect(b.map((i) => [i.residentId, i.reason])).toEqual([
      ['harold', 'Recheck overdue'],
      ['ruth', 'Not yet seen by a nurse'],
      ['arthur', 'Offered, nothing recorded'],
      ['margaret', 'Closed with outcome'],
    ])
  })

  it('is deterministic', () => {
    expect(applyAll(seedWard(), [evelynCheckin])).toEqual(applyAll(seedWard(), [evelynCheckin]))
  })
})

describe('workflow 1: spot it', () => {
  it('a check-in with changes opens a concern; unchecked areas become explicit unknowns', () => {
    const w = apply(seedWard(), evelynCheckin)
    const c = concernOf(w, 'evelyn')
    expect(c.status).toBe('new')
    expect(c.changed.map((x) => x.area)).toEqual(['mobility', 'eating', 'mood'])
    expect(c.unknown).toEqual(['drinking', 'pain'])
    expect(c.changed[0]!.quote).toContain('stay put')
    expect(board(w)[1]).toMatchObject({ residentId: 'evelyn', reason: 'Not yet seen by a nurse' })
  })

  it('an all-usual check-in records observations without opening a concern', () => {
    const w = apply(seedWard(), { type: 'checkin', by: 'maya', residentId: 'joseph', findings: [{ area: 'mobility', status: 'usual' }] })
    expect(deriveConcerns(w).some((c) => c.residentId === 'joseph')).toBe(false)
  })

  it('a "different" area needs a finding', () => {
    expect(() => apply(seedWard(), { type: 'checkin', by: 'maya', residentId: 'evelyn', findings: [{ area: 'eating', status: 'different' }] })).toThrow(WardError)
  })
})

describe('workflow 2: size it up', () => {
  it('readings are compared with the resident’s own usual range', () => {
    let w = apply(seedWard(), evelynCheckin)
    w = apply(w, { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'temp', value: 37.6 })
    w = apply(w, { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'fluids', value: 250 })
    const c = concernOf(w, 'evelyn')
    expect(c.checks[0]!.reading).toMatchObject({ inUsual: false })
    expect(c.checks[0]!.reading.text).toContain('above her usual 36.2 to 36.8')
    expect(c.checks[1]!.reading.text).toMatch(/about \d+% of her usual/)
    expect(c.unknown).toEqual(['pain'])
  })

  it('a watch plan sets a recheck; missing it makes the concern overdue', () => {
    let w = apply(seedWard(), evelynCheckin)
    const id = concernOf(w, 'evelyn').id
    w = apply(w, { type: 'plan', by: 'priya', concernId: id, decision: 'watch', recheckIn: 120, recheck: ['eating', 'drinking'] })
    expect(concernOf(w, 'evelyn').status).toBe('watching')
    w = apply(w, { type: 'advance', to: w.now + 180 })
    expect(concernOf(w, 'evelyn').overdue).toBe(true)
    expect(board(w)[0]!.reason).toBe('Recheck overdue')
  })

  it('a concern closes only on a recorded outcome for every changed area', () => {
    let w = apply(seedWard(), evelynCheckin)
    const id = concernOf(w, 'evelyn').id
    expect(() => apply(w, { type: 'resolve', by: 'priya', concernId: id })).toThrow(/no outcome recorded for mobility, eating, mood/)
    w = apply(w, { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'walk', value: 'Walked as usual' })
    w = apply(w, { type: 'checkin', by: 'maya', residentId: 'evelyn', findings: [{ area: 'eating', status: 'usual' }, { area: 'mood', status: 'usual' }] })
    w = apply(w, { type: 'resolve', by: 'priya', concernId: id })
    expect(deriveConcerns(w).find((c) => c.id === id)!.status).toBe('resolved')
  })

  it('an escalation needs a recipient, and the SBAR uses only recorded facts', () => {
    let w = apply(seedWard(), evelynCheckin)
    const id = concernOf(w, 'evelyn').id
    expect(() => apply(w, { type: 'plan', by: 'priya', concernId: id, decision: 'escalate', recheckIn: 60, recheck: ['eating'] })).toThrow(/who/)
    w = apply(w, { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'temp', value: 37.6 })
    const s = templateSbar(w, id)
    const facts = sbarFacts(w, id).map((f) => f.text).join(' ')
    expect(s.situation).toContain('ate about a quarter')
    expect(s.assessment).toContain('37.6')
    expect(facts).toContain('37.6')
    expect(s.assessment).toContain('Not yet known: drinking, pain')
  })
})

describe('workflow 3: carry it forward', () => {
  it('offered without an amount is flagged until a measured amount is recorded', () => {
    let w = seedWard()
    expect(offerFlags(w)).toMatchObject([{ residentId: 'arthur', count: 3 }])
    w = apply(w, { type: 'measure', by: 'sam', residentId: 'arthur', kind: 'fluids', value: 300 })
    expect(offerFlags(w)).toEqual([])
  })

  it('the 15:00 handover lists every open loop and needs each one acknowledged', () => {
    let w = apply(seedWard(), evelynCheckin)
    expect(handover(w).open).toBe(false)
    expect(() => apply(w, { type: 'ack', by: 'daniel', key: 'h2' })).toThrow(/opens at 14:30/)
    w = apply(w, { type: 'advance', to: t('Tue', '15:00') })
    const h = handover(w)
    expect(h.at).toBe(t('Tue', '15:00'))
    expect(h.items.map((i) => [i.residentId, i.group])).toEqual([
      ['arthur', 'action'],
      ['evelyn', 'action'],
      ['harold', 'action'],
      ['ruth', 'action'],
      ['margaret', 'closed'],
    ])
    for (const i of h.items) w = apply(w, { type: 'ack', by: 'daniel', key: i.key })
    expect(handover(w).items.every((i) => i.ack)).toBe(true)
    expect(() => apply(w, { type: 'ack', by: 'daniel', key: 'h2' })).toThrow(/Already/)
  })

  it('a loop closed during the shift appears as closed, with how it was closed', () => {
    let w = apply(seedWard(), evelynCheckin)
    const id = concernOf(w, 'evelyn').id
    w = applyAll(w, [
      { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'walk', value: 'Walked as usual' },
      { type: 'checkin', by: 'maya', residentId: 'evelyn', findings: [{ area: 'eating', status: 'usual' }, { area: 'mood', status: 'usual' }] },
      { type: 'resolve', by: 'priya', concernId: id },
      { type: 'advance', to: t('Tue', '15:00') },
    ])
    const item = handover(w).items.find((i) => i.residentId === 'evelyn')!
    expect(item.group).toBe('closed')
    expect(item.done[0]).toMatch(/recorded outcome/)
  })
})

describe('the relay', () => {
  const lane = (w: Ward, rid: string) => relay(w).find((l) => l.residentId === rid)!
  const states = (w: Ward, rid: string) => lane(w, rid).stages.map((s) => s.state)

  it('shows where each concern is held at the start', () => {
    const w = seedWard()
    expect(relay(w).map((l) => [l.residentId, l.stuck?.stage ?? null])).toEqual([
      ['arthur', 'noticed'],
      ['ruth', 'seen'],
      ['harold', 'plan'],
      ['margaret', null],
    ])
    expect(states(w, 'harold')).toEqual(['done', 'done', 'stuck', 'missed', 'later'])
    expect(lane(w, 'harold').stages[3]!.text).toBe('2 shift changes, no sign-off')
    expect(lane(w, 'ruth').stuck!.text).toBe('Waiting 65 min')
  })

  it('moves the baton as the three workflows happen', () => {
    let w = applyAll(seedWard(), [evelynCheckin])
    expect(states(w, 'evelyn')).toEqual(['done', 'stuck', 'later', 'later', 'later'])
    const id = concernOf(w, 'evelyn').id
    w = applyAll(w, [
      { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'temp', value: 37.6 },
      { type: 'plan', by: 'priya', concernId: id, decision: 'escalate', to: 'osei', recheckIn: 120, recheck: ['mobility'] },
    ])
    expect(states(w, 'evelyn')).toEqual(['done', 'done', 'done', 'later', 'later'])
    expect(lane(w, 'evelyn').stages[1]!.text).toBe('Priya, after 2 min')
    w = apply(w, { type: 'advance', to: t('Tue', '15:00') })
    expect(lane(w, 'evelyn').stuck).toMatchObject({ stage: 'plan' })
    expect(lane(w, 'evelyn').stages[3]!.state).toBe('stuck')
    w = apply(w, { type: 'ack', by: 'daniel', key: id })
    expect(lane(w, 'evelyn').stages[3]).toMatchObject({ state: 'done', by: 'daniel' })
  })
})
