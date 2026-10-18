import { templateDraft, validateDraft, type AttemptState, type Fact, type HandoverDraft, type Scenario } from '@thread/engine'
import { z } from 'zod'
import type { Config } from './config'

/**
 * Gemini-assisted SBAR handover drafts.
 *
 * The model only organises and phrases facts the server supplies: the resident's documented baseline and the events
 * revealed in this attempt. Its output must match a JSON schema whose fact ids are restricted to the supplied ids, and
 * is then validated on the server (no unknowns presented as known, no numbers absent from the facts, no diagnosis,
 * treatment or reassurance language). Anything else — no key, a timeout, an HTTP error, invalid output, an exhausted
 * budget — returns the deterministic template draft with the reason. The simulation never depends on the model.
 */

export interface DraftResult {
  draft: HandoverDraft
  source: 'gemini' | 'template'
  model: string | null
  fallbackReason: string | null
  validation: string[]
}

const SYSTEM = `You format shift handovers for a long-term-care TRAINING SIMULATION. The resident and all facts are fictional.
Write an SBAR handover from a personal support worker to the charge nurse using ONLY the facts provided in the input.

Rules:
- Every section lists, in fact_ids, the ids of the facts it relies on.
- situation: what is happening now, in one or two sentences, citing observed facts.
- background: what is usual for this resident, citing baseline facts.
- assessment: what was actually observed, with day and time, oldest first. Never cite or restate a fact whose kind is "unknown" here. Keep what was offered separate from what was consumed.
- recommendation: what the writer asks the nurse for (an assessment, what to record, who to tell). Do not decide the cause or the treatment.
- unknowns: one entry per thing that is not known, citing the "unknown" facts.
- Never add a fact, number, time, vital sign, medication, intervention, outcome, history, diagnosis or likely cause that is not in the facts.
- Do not name diagnoses or possible causes, do not give treatment or medication instructions, and do not say the resident is safe or fine.
- Use plain, short sentences a busy nurse can scan. This draft will be reviewed and edited by the staff member; it does not replace their assessment or the facility's reporting procedures.`

const section = z.object({ text: z.string().max(1200), fact_ids: z.array(z.string()).max(40) })
const ModelDraft = z.object({
  situation: section,
  background: section,
  assessment: section,
  recommendation: section,
  unknowns: z.array(section).max(8),
})

function responseSchema(factIds: string[]) {
  const sec = (description: string) => ({
    type: 'object',
    properties: {
      text: { type: 'string', description },
      fact_ids: { type: 'array', items: { type: 'string', enum: factIds }, description: 'Ids of the supplied facts this section relies on.' },
    },
    required: ['text', 'fact_ids'],
  })
  return {
    type: 'object',
    properties: {
      situation: sec('What is happening now, compared with the resident’s usual.'),
      background: sec('What is usual for this resident.'),
      assessment: sec('Timed observations, oldest first. No unknowns.'),
      recommendation: sec('What the writer asks the nurse for. No diagnosis or treatment.'),
      unknowns: { type: 'array', items: sec('One thing that is not known.'), maxItems: 8 },
    },
    required: ['situation', 'background', 'assessment', 'recommendation', 'unknowns'],
  }
}

const toDraft = (m: z.infer<typeof ModelDraft>): HandoverDraft => {
  const s = (x: z.infer<typeof section>) => ({ text: x.text.trim(), factIds: [...new Set(x.fact_ids)] })
  return {
    situation: s(m.situation),
    background: s(m.background),
    assessment: s(m.assessment),
    recommendation: s(m.recommendation),
    unknowns: m.unknowns.map(s).filter((u) => u.text),
  }
}

export class GeminiDrafter {
  private recent: number[] = []

  constructor(
    private readonly cfg: Config['gemini'],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  status() {
    return {
      configured: !!this.cfg.apiKey,
      model: this.cfg.model,
      maxDraftsPerAttempt: this.cfg.maxDraftsPerAttempt,
    }
  }

  private budgetLeft(now: number) {
    this.recent = this.recent.filter((t) => now - t < 3_600_000)
    return this.recent.length < this.cfg.maxRequestsPerHour
  }

  async draft(
    s: Scenario,
    st: AttemptState,
    facts: Fact[],
    handover: { to: string; purpose: string },
    opts: { selected?: string[]; draftsSoFar: number },
  ): Promise<DraftResult> {
    const fallback = (reason: string, validation: string[] = []): DraftResult => ({
      draft: templateDraft(s, st, opts.selected),
      source: 'template',
      model: null,
      fallbackReason: reason,
      validation,
    })
    if (!this.cfg.apiKey) return fallback('Gemini is not configured on this server, so the standard template was used.')
    if (opts.draftsSoFar >= this.cfg.maxDraftsPerAttempt)
      return fallback(`This attempt has used its ${this.cfg.maxDraftsPerAttempt} AI drafts, so the standard template was used.`)
    const now = Date.now()
    if (!this.budgetLeft(now)) return fallback('The hourly AI request budget is used up, so the standard template was used.')
    this.recent.push(now)

    const supplied = facts.filter((f) => !opts.selected || opts.selected.includes(f.id) || f.kind === 'baseline')
    const r = s.resident
    const input = {
      simulation: 'Synthetic training scenario. Not a real resident.',
      resident: { name: r.name, room: r.room, wing: r.wing },
      handover: { from: 'Personal support worker (the player)', to: handover.to, purpose: handover.purpose },
      facts: supplied.map((f) => ({ id: f.id, kind: f.kind, when: f.when, source: f.source, text: f.text })),
    }

    let raw: unknown
    try {
      const res = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.cfg.model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.cfg.apiKey },
          signal: AbortSignal.timeout(this.cfg.timeoutMs),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: responseSchema(supplied.map((f) => f.id)),
              temperature: 0.2,
              maxOutputTokens: 4096,
            },
          }),
        },
      )
      if (!res.ok) return fallback(`Gemini returned HTTP ${res.status}, so the standard template was used.`)
      const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] }
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      if (!text) return fallback(`Gemini returned no draft (${body.candidates?.[0]?.finishReason ?? 'empty response'}), so the standard template was used.`)
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

    const parsed = ModelDraft.safeParse(raw)
    if (!parsed.success) return fallback('Gemini’s draft did not match the handover schema, so the standard template was used.')
    const draft = toDraft(parsed.data)
    const { errors } = validateDraft(draft, supplied, { strict: true })
    if (errors.length) return fallback('Gemini’s draft failed the grounding checks, so the standard template was used.', errors)
    return { draft, source: 'gemini', model: this.cfg.model, fallbackReason: null, validation: [] }
  }
}
