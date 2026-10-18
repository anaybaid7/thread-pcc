import { apply, deriveConcerns, seedWard } from '@thread/engine'
import { describe, expect, it, vi } from 'vitest'
import { readConfig } from '../src/config'
import { GeminiDrafter } from '../src/gemini'

const SECRET = 'test-key-never-logged'
let ward = apply(seedWard(), {
  type: 'checkin',
  by: 'maya',
  residentId: 'evelyn',
  findings: [
    { area: 'eating', status: 'different', finding: 'Ate about a quarter' },
    { area: 'drinking', status: 'unchecked' },
  ],
})
ward = apply(ward, { type: 'measure', by: 'priya', residentId: 'evelyn', kind: 'temp', value: 37.6 })
const concernId = deriveConcerns(ward).find((c) => c.residentId === 'evelyn')!.id

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
const model = (d: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(d) }] } }] })
const good = {
  situation: 'Evelyn Carter ate about a quarter of breakfast today, unlike her usual.',
  background: 'She usually eats most of her breakfast in the dining room.',
  assessment: 'Temperature 37.6 °C, above her usual 36.2 to 36.8. Drinking not yet known.',
  recommendation: 'Please assess her this morning and tell me what to monitor.',
}
const drafter = (f: typeof fetch, over = {}) => new GeminiDrafter({ ...readConfig({}).gemini, apiKey: SECRET, ...over }, f)

describe('SBAR drafts', () => {
  it('falls back to the template without a key', async () => {
    const r = await new GeminiDrafter({ ...readConfig({}).gemini, apiKey: null }).draft(ward, concernId)
    expect(r.source).toBe('template')
    expect(r.draft.assessment).toContain('37.6')
  })

  it('uses a grounded draft; the key travels only in the header', async () => {
    const f = reply(model(good))
    const r = await drafter(f).draft(ward, concernId)
    expect(r.source).toBe('gemini')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).not.toContain(SECRET)
    expect(init.body as string).not.toContain(SECRET)
    expect(JSON.parse(init.body as string).contents[0].parts[0].text).toContain('37.6')
  })

  it('rejects an invented reading and a named diagnosis', async () => {
    const r1 = await drafter(reply(model({ ...good, assessment: good.assessment + ' Pulse 112.' }))).draft(ward, concernId)
    expect(r1.source).toBe('template')
    expect(r1.validation.join()).toMatch(/112/)
    const r2 = await drafter(reply(model({ ...good, recommendation: 'Probably a urinary infection; start antibiotics.' }))).draft(ward, concernId)
    expect(r2.validation.join()).toMatch(/diagnosis|treatment/)
  })

  it('falls back on HTTP errors, bad output, timeouts and the hourly budget', async () => {
    expect((await drafter(reply({}, 500)).draft(ward, concernId)).fallbackReason).toMatch(/HTTP 500/)
    expect((await drafter(reply(model({ situation: 1 }))).draft(ward, concernId)).fallbackReason).toMatch(/format/)
    const slow = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch
    const t = await drafter(slow, { timeoutMs: 20 }).draft(ward, concernId)
    expect(t.fallbackReason).toMatch(/did not answer/)
    expect(JSON.stringify(t)).not.toContain(SECRET)
    const once = drafter(reply(model(good)), { maxRequestsPerHour: 1 })
    expect((await once.draft(ward, concernId)).source).toBe('gemini')
    expect((await once.draft(ward, concernId)).fallbackReason).toMatch(/hourly/)
  })
})
