import { languageIssues, sbarFacts, templateSbar, type Fact, type Sbar, type Ward } from '@thread/engine'
import { z } from 'zod'
import type { Config } from './config'

/**
 * Gemini drafts the SBAR a nurse sends when escalating. It sees only the facts recorded for that concern and must
 * return four plain sections. The server rejects any draft with a number that isn't in the facts, or with diagnosis,
 * treatment or reassurance language. Anything else (no key, timeout, HTTP error, bad output, budget used) returns the
 * deterministic template with the reason. Escalation never depends on the model.
 */

export interface SbarResult {
  draft: Sbar
  source: 'gemini' | 'template'
  model: string | null
  fallbackReason: string | null
  validation: string[]
  facts: Fact[]
}

const SYSTEM = `You write SBAR escalations for a long-term care charge nurse. The resident and all facts are fictional (a demo).
Use ONLY the facts provided. Four short sections:
- situation: what is happening now compared with the resident's usual, and since when.
- background: what is usual for this resident.
- assessment: the readings and observations recorded, with times, and what is not yet known.
- recommendation: what the nurse is asking for (an assessment, what to monitor). Do not name a diagnosis or likely cause, do not suggest treatment or medication, do not say the resident is safe or fine.
Never add a number, reading, time, history or outcome that is not in the facts. Plain sentences.`

const Out = z.object({ situation: z.string().min(1).max(800), background: z.string().min(1).max(800), assessment: z.string().min(1).max(1200), recommendation: z.string().min(1).max(600) })

const schema = {
  type: 'object',
  properties: Object.fromEntries(['situation', 'background', 'assessment', 'recommendation'].map((k) => [k, { type: 'string' }])),
  required: ['situation', 'background', 'assessment', 'recommendation'],
}

const numbers = (s: string) => [...s.matchAll(/\d{1,2}:\d{2}|\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/^0(\d:)/, '$1'))

/** Grounding checks for a model draft. */
export function checkSbar(d: Omit<Sbar, 'source'>, facts: Fact[]): string[] {
  const allowed = new Set(numbers(facts.map((f) => f.text).join(' ')))
  const errors: string[] = []
  for (const [k, v] of Object.entries(d)) {
    for (const i of languageIssues(v)) errors.push(`The ${k} ${i.why} (“${i.match}”).`)
    const extra = numbers(v).filter((n) => !allowed.has(n))
    if (extra.length) errors.push(`The ${k} has numbers not in the record (${extra.join(', ')}).`)
  }
  return errors
}

export class GeminiDrafter {
  private recent: number[] = []

  constructor(
    private readonly cfg: Config['gemini'],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  status() {
    return { configured: !!this.cfg.apiKey, model: this.cfg.model }
  }

  async draft(ward: Ward, concernId: string): Promise<SbarResult> {
    const facts = sbarFacts(ward, concernId)
    const fallback = (reason: string, validation: string[] = []): SbarResult => ({ draft: templateSbar(ward, concernId), source: 'template', model: null, fallbackReason: reason, validation, facts })
    if (!this.cfg.apiKey) return fallback('Gemini is not configured on this server, so the standard template was used.')
    const now = Date.now()
    this.recent = this.recent.filter((t) => now - t < 3_600_000)
    if (this.recent.length >= this.cfg.maxRequestsPerHour) return fallback('The hourly AI request budget is used up, so the standard template was used.')
    this.recent.push(now)

    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify({ facts: facts.map((f) => f.text) }) }] }],
      // A short, structured rewrite of given facts: low thinking keeps it fast.
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingLevel: 'low' } },
    })
    const call = (model: string) =>
      this.fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cfg.apiKey! },
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
        body,
      })
    // Busy or rate-limited: retry once, then try the fallback model once. Anything else falls back to the template.
    const attempts = [this.cfg.model, this.cfg.model, ...(this.cfg.fallbackModel && this.cfg.fallbackModel !== this.cfg.model ? [this.cfg.fallbackModel] : [])]
    let raw: unknown
    let used = this.cfg.model
    try {
      let res: Response | null = null
      for (const [i, model] of attempts.entries()) {
        if (i > 0) await new Promise((r) => setTimeout(r, 500))
        used = model
        res = await call(model)
        if (![429, 500, 502, 503, 504].includes(res.status)) break
      }
      if (!res!.ok) return fallback(`Gemini returned HTTP ${res!.status}, so the standard template was used.`)
      const out = (await res!.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
      const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (!text) return fallback('Gemini returned no draft, so the standard template was used.')
      raw = JSON.parse(text)
    } catch (e) {
      const name = (e as Error).name
      return fallback(
        name === 'TimeoutError' || name === 'AbortError'
          ? `Gemini did not answer within ${Math.round(this.cfg.timeoutMs / 1000)} seconds, so the standard template was used.`
          : name === 'SyntaxError'
            ? 'Gemini returned malformed JSON, so the standard template was used.'
            : 'Gemini could not be reached, so the standard template was used.',
      )
    }
    const parsed = Out.safeParse(raw)
    if (!parsed.success) return fallback('Gemini’s draft did not match the SBAR format, so the standard template was used.')
    const errors = checkSbar(parsed.data, facts)
    if (errors.length) return fallback('Gemini’s draft failed the grounding checks, so the standard template was used.', errors)
    return { draft: { ...parsed.data, source: 'gemini' }, source: 'gemini', model: used, fallbackReason: null, validation: [], facts }
  }
}
