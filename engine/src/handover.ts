import { node, when } from './core'
import { languageIssues } from './language'
import type { AttemptState, DraftSection, Fact, HandoverDraft, Scenario, ScenarioEvent } from './types'

/**
 * SBAR handover support. The facts a handover may cite are exactly: the resident's documented baseline, plus every
 * event revealed in this attempt. Unknowns stay unknowns. The template draft below is the deterministic fallback when
 * no model is available, and the validator is applied both to model drafts (strict) and to what the player submits.
 */

export function handoverFacts(s: Scenario, st: AttemptState): Fact[] {
  const byId = new Map<string, ScenarioEvent>()
  for (const n of Object.values(s.nodes)) for (const e of n.events) byId.set(e.id, e)
  const r = s.resident
  return [
    { id: 'profile', kind: 'baseline', when: null, source: 'Profile', text: `${r.name}, ${r.age}, room ${r.room}, ${r.wing} wing` },
    ...r.baseline.map((b) => ({ id: b.id, kind: 'baseline' as const, when: null, source: 'Care plan', text: b.text })),
    ...st.revealed.map((id) => {
      const e = byId.get(id)!
      return { id, kind: e.kind, when: when(s, e), source: e.source, text: e.fact }
    }),
  ]
}

const OBSERVED_KINDS = new Set(['observation', 'documentation', 'action'])

export function isObserved(f: Fact) {
  return OBSERVED_KINDS.has(f.kind)
}

export function templateDraft(s: Scenario, st: AttemptState, selected?: string[]): HandoverDraft {
  const spec = node(s, st.nodeId).handover
  if (!spec) throw new Error('No handover at this point')
  const facts = handoverFacts(s, st)
  const use = (f: Fact) => !selected || selected.includes(f.id)
  const baseline = facts.filter((f) => f.kind === 'baseline' && use(f))
  const observed = facts.filter((f) => isObserved(f) && use(f))
  const unknown = facts.filter((f) => f.kind === 'unknown' && use(f))
  const revealed = new Set(st.revealed)
  return {
    situation: { text: spec.situation.text, factIds: spec.situation.factIds.filter((id) => revealed.has(id)) },
    background: {
      text: baseline.map((f) => `${f.text}.`).join(' '),
      factIds: baseline.map((f) => f.id),
    },
    assessment: {
      text: observed.map((f) => `${f.when}: ${f.text}.`).join('\n'),
      factIds: observed.map((f) => f.id),
    },
    recommendation: { text: spec.recommendation, factIds: [] },
    unknowns: unknown.map((f) => ({ text: f.text, factIds: [f.id] })),
  }
}

export const SECTION_LIMIT = 1200

/**
 * Structural checks for any draft, plus grounding checks for model output (strict):
 * every cited fact must exist; unknowns may not support the situation, background or assessment; in strict mode the
 * text may not use diagnosis/treatment/reassurance language or numbers that appear in none of the supplied facts.
 */
export function validateDraft(draft: HandoverDraft, facts: Fact[], opts: { strict: boolean; extraNumbers?: string[] }) {
  const errors: string[] = []
  const byId = new Map(facts.map((f) => [f.id, f]))
  const sections: [string, DraftSection][] = [
    ['situation', draft.situation],
    ['background', draft.background],
    ['assessment', draft.assessment],
    ['recommendation', draft.recommendation],
    ...draft.unknowns.map((u, i) => [`unknown ${i + 1}`, u] as [string, DraftSection]),
  ]
  const allowedNumbers = new Set([
    ...(opts.extraNumbers ?? []),
    ...facts.flatMap((f) => numbers(`${f.text} ${f.when ?? ''}`)),
  ])
  for (const [name, sec] of sections) {
    if (sec.text.length > SECTION_LIMIT) errors.push(`The ${name} is too long.`)
    for (const id of sec.factIds) {
      const f = byId.get(id)
      if (!f) {
        errors.push(`The ${name} cites a fact that isn’t in this attempt (${id}).`)
        continue
      }
      const isUnknownSection = name.startsWith('unknown')
      if (f.kind === 'unknown' && !isUnknownSection && name !== 'recommendation')
        errors.push(`The ${name} cites an unknown (“${f.text}”) as if it were known.`)
      if (opts.strict && isUnknownSection && f.kind !== 'unknown') errors.push(`An unknown cites a recorded fact (${id}).`)
    }
    if (opts.strict) {
      for (const issue of languageIssues(sec.text)) errors.push(`The ${name} ${issue.why} (“${issue.match}”).`)
      const invented = numbers(sec.text).filter((n) => !allowedNumbers.has(n))
      if (invented.length) errors.push(`The ${name} contains numbers not in the evidence (${invented.join(', ')}).`)
    }
  }
  if (opts.strict) {
    if (!draft.situation.text.trim() || !draft.assessment.text.trim()) errors.push('The situation and assessment are required.')
    if (!draft.situation.factIds.length || !draft.assessment.factIds.length) errors.push('The situation and assessment must cite facts.')
  }
  return { errors }
}

/** Numbers and clock times in a text, normalised so "08:10" and "8:10" match. */
export function numbers(text: string): string[] {
  return [...text.matchAll(/\d{1,2}:\d{2}|\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/^0(\d:)/, '$1'))
}
