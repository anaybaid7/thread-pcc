import { isObserved } from './handover'
import { languageIssues } from './language'
import type { AttemptState, Criterion, Fact, HandoverDraft, Scenario, ScoreLine } from './types'

/**
 * Prototype rubric, 100 points, all explicit rules:
 *   recognition of deviation from baseline 30 · communication/action 30 · facts vs assumptions vs unknowns 25 ·
 *   handover clarity 15.
 * Decision lines come from engine.scoreDecision. Handover clarity is five checks worth 3 each. No points for naming a
 * diagnosis, predicting an outcome, or reaching the most dramatic ending. Illustrative only, not a validated measure.
 */

export const CRITERIA: { key: Criterion; label: string; max: number; about: string }[] = [
  { key: 'recognition', label: 'Recognising change from baseline', max: 30, about: 'Did you see what differed from their usual, and how it developed?' },
  { key: 'communication', label: 'Communication and action', max: 30, about: 'Did the right people hear it, in time, as observations?' },
  { key: 'evidence', label: 'Facts, assumptions and unknowns', max: 25, about: 'Did you keep what was seen apart from guesses and gaps?' },
  { key: 'handover', label: 'Handover clarity', max: 15, about: 'Could the nurse act on your handover?' },
]

const PER_CHECK = 3

export function scoreHandover(s: Scenario, _st: AttemptState, draft: HandoverDraft, facts: Fact[]): ScoreLine[] {
  const byId = new Map(facts.map((f) => [f.id, f]))
  const cited = (ids: string[]) => ids.map((id) => byId.get(id)).filter((f): f is Fact => !!f)
  const name = s.resident.preferredName
  const line = (item: string, earned: number, reason: string): ScoreLine => ({ criterion: 'handover', item: `Handover · ${item}`, earned, max: PER_CHECK, reason })
  const lang = (text: string) => {
    const i = languageIssues(text)[0]
    return i ? `“${i.match}” ${i.why}. Describe what was seen and let the nurse assess.` : null
  }
  const unknownCited = (ids: string[]) => cited(ids).find((f) => f.kind === 'unknown')

  const lines: ScoreLine[] = []

  const sit = draft.situation
  const sitLang = lang(sit.text)
  lines.push(
    !sit.text.trim()
      ? line('Situation', 0, 'Empty. Say what is happening now.')
      : sitLang
        ? line('Situation', 0, sitLang)
        : cited(sit.factIds).some(isObserved)
          ? line('Situation', PER_CHECK, 'States what is happening now and ties it to something observed.')
          : line('Situation', 1, 'Link the situation to at least one thing that was observed.'),
  )

  const bg = draft.background
  const bgLang = lang(bg.text)
  lines.push(
    !bg.text.trim()
      ? line('Background', 0, `Empty. Say what is usual for ${name}: it is what makes the change meaningful.`)
      : bgLang
        ? line('Background', 0, bgLang)
        : cited(bg.factIds).some((f) => f.kind === 'baseline')
          ? line('Background', PER_CHECK, `Gives ${name}’s usual pattern, so the change can be judged against it.`)
          : line('Background', 1, `Include at least one fact about ${name}’s usual pattern.`),
  )

  const as = draft.assessment
  const asLang = lang(as.text)
  const asUnknown = unknownCited(as.factIds)
  const asObserved = cited(as.factIds).filter(isObserved).length
  lines.push(
    !as.text.trim()
      ? line('Assessment', 0, 'Empty. List what was observed, with times.')
      : asUnknown
        ? line('Assessment', 0, `Lists an unknown as an observation: “${asUnknown.text}”. Put it under unknowns.`)
        : asLang
          ? line('Assessment', 0, asLang)
          : asObserved >= 2
            ? line('Assessment', PER_CHECK, `Cites ${asObserved} timed observations, so the trend is visible.`)
            : line('Assessment', asObserved === 1 ? 2 : 1, 'Cite at least two timed observations so the nurse can see the pattern.'),
  )

  const rec = draft.recommendation
  const recLang = lang(rec.text)
  lines.push(
    rec.text.trim().length < 10
      ? line('Recommendation', 0, 'Say what you are asking for: an assessment, what to record, who to tell.')
      : recLang
        ? line('Recommendation', 0, recLang)
        : line('Recommendation', PER_CHECK, 'Makes a clear request without deciding the cause or the treatment.'),
  )

  const unknownFacts = facts.filter((f) => f.kind === 'unknown')
  const listed = draft.unknowns.filter((u) => u.text.trim())
  lines.push(
    listed.length
      ? line('Unknowns', PER_CHECK, `Names ${listed.length === 1 ? 'one thing' : `${listed.length} things`} that isn’t known, so nobody mistakes a gap for a finding.`)
      : line(
          'Unknowns',
          0,
          unknownFacts.length
            ? `Name what isn’t known, for example: ${unknownFacts.map((f) => f.text.toLowerCase()).slice(0, 2).join('; ')}.`
            : 'Name what isn’t known.',
        ),
  )
  return lines
}

export function breakdown(lines: ScoreLine[]) {
  const criteria = CRITERIA.map((c) => {
    const mine = lines.filter((l) => l.criterion === c.key)
    return { ...c, earned: mine.reduce((n, l) => n + l.earned, 0), lines: mine }
  })
  return { total: criteria.reduce((n, c) => n + c.earned, 0), max: 100, criteria }
}
