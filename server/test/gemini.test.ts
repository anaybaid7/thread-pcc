import { advance, decide, evelyn, handoverFacts, pendingDecision, start, type AttemptState } from '@thread/engine'
import { describe, expect, it, vi } from 'vitest'
import { readConfig } from '../src/config'
import { GeminiDrafter } from '../src/gemini'

const SECRET = 'test-key-never-logged'

function atHandover(): AttemptState {
  let st = start(evelyn, 'persist')
  const go = () => {
    while (st.phase === 'prebrief' || st.phase === 'playing') st = advance(evelyn, st).state
  }
  go()
  while (st.phase === 'decision') {
    const dp = pendingDecision(evelyn, st)!
    st = decide(evelyn, st, dp.id, {
      recognition: dp.recognition.kind === 'dimensions' ? ['mobility'] : ['more'],
      tags: Object.fromEntries(dp.statements.map((x) => [x.id, x.answer])),
      choice: dp.choices[0]!.id,
    }).state
    go()
  }
  return st
}

const st = atHandover()
const facts = handoverFacts(evelyn, st)
const spec = { to: 'Priya', purpose: 'Handover' }

function reply(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
}

function modelText(draft: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(draft) }] }, finishReason: 'STOP' }] }
}

const good = {
  situation: { text: 'Evelyn has stayed in her room and eaten much less than usual since Monday; this morning she needed help to walk.', fact_ids: ['m2', 'tp7'] },
  background: { text: 'She usually eats most of her breakfast and walks to meals with her rollator.', fact_ids: ['b1', 'b2'] },
  assessment: { text: 'Mon 08:10: ate about a quarter of breakfast. Tue 08:20: needed one person to steady her.', fact_ids: ['m2', 'tp7'] },
  recommendation: { text: 'Please assess her this morning and tell me what to record.', fact_ids: [] },
  unknowns: [{ text: 'How much she drank overnight.', fact_ids: ['tp8'] }],
}

const drafter = (fetchImpl: typeof fetch, over: Partial<ReturnType<typeof readConfig>['gemini']> = {}) =>
  new GeminiDrafter({ ...readConfig({}).gemini, apiKey: SECRET, ...over }, fetchImpl)

describe('Gemini handover drafts', () => {
  it('falls back to the template without an API key', async () => {
    const f = vi.fn()
    const r = await new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }, f).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })
    expect(r.source).toBe('template')
    expect(r.fallbackReason).toMatch(/not configured/)
    expect(r.draft.unknowns.length).toBeGreaterThan(0)
    expect(f).not.toHaveBeenCalled()
  })

  it('uses a grounded, valid model draft and sends the key only in the header', async () => {
    const f = reply(modelText(good))
    const r = await drafter(f).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })
    expect(r.source).toBe('gemini')
    expect(r.draft.assessment.factIds).toEqual(['m2', 'tp7'])
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain(SECRET)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(SECRET)
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseJsonSchema.properties.situation.properties.fact_ids.items.enum).toContain('m2')
    expect(init.body as string).not.toContain(SECRET)
  })

  it('rejects a draft that invents a vital sign', async () => {
    const bad = { ...good, assessment: { ...good.assessment, text: good.assessment.text + ' Temperature 38.2.' } }
    const r = await drafter(reply(modelText(bad))).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })
    expect(r.source).toBe('template')
    expect(r.validation.join()).toMatch(/38.2/)
  })

  it('rejects a draft that presents an unknown as an observation', async () => {
    const bad = { ...good, assessment: { ...good.assessment, fact_ids: ['m2', 'tp8'] } }
    const r = await drafter(reply(modelText(bad))).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })
    expect(r.source).toBe('template')
    expect(r.validation.join()).toMatch(/as if it were known/)
  })

  it('rejects a draft that names a diagnosis', async () => {
    const bad = { ...good, recommendation: { text: 'Please check for a urinary infection.', fact_ids: [] } }
    const r = await drafter(reply(modelText(bad))).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })
    expect(r.source).toBe('template')
    expect(r.validation.join()).toMatch(/diagnosis/)
  })

  it('falls back on HTTP errors, malformed output and schema mismatches', async () => {
    expect((await drafter(reply({ error: 'x' }, 500)).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })).fallbackReason).toMatch(/HTTP 500/)
    const malformed = reply({ candidates: [{ content: { parts: [{ text: '{not json' }] } }] })
    expect((await drafter(malformed).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })).fallbackReason).toMatch(/malformed/)
    const wrong = reply(modelText({ situation: 'just a string' }))
    expect((await drafter(wrong).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })).fallbackReason).toMatch(/schema/)
  })

  it('falls back on timeout without leaking the key', async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    ) as unknown as typeof fetch
    const r = await drafter(slow, { timeoutMs: 20 }).draft(evelyn, st, facts, spec, { draftsSoFar: 0 })
    expect(r.source).toBe('template')
    expect(r.fallbackReason).toMatch(/did not answer/)
    expect(JSON.stringify(r)).not.toContain(SECRET)
  })

  it('respects the per-attempt and hourly budgets', async () => {
    const f = reply(modelText(good))
    const perAttempt = await drafter(f, { maxDraftsPerAttempt: 2 }).draft(evelyn, st, facts, spec, { draftsSoFar: 2 })
    expect(perAttempt.fallbackReason).toMatch(/used its 2 AI drafts/)
    const hourly = drafter(f, { maxRequestsPerHour: 1 })
    expect((await hourly.draft(evelyn, st, facts, spec, { draftsSoFar: 0 })).source).toBe('gemini')
    expect((await hourly.draft(evelyn, st, facts, spec, { draftsSoFar: 0 })).fallbackReason).toMatch(/hourly/)
  })
})
