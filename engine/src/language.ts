/**
 * Language a handover from a support worker should not contain: diagnoses or causes nobody assessed, treatment or
 * medication instructions, and reassurance that a resident is safe because nothing alarming was written down.
 * Used to score the player's handover and to reject model drafts. Deliberately conservative and transparent.
 */

const RULES: { pattern: RegExp; why: string }[] = [
  {
    pattern:
      /\b(infection|infected|uti|urinary tract|sepsis|septic|pneumonia|dehydrat\w*|delirium|dementia|stroke|heart attack|covid|influenza|depress\w*|diagnos\w*|failure to thrive)\b/i,
    why: 'names a diagnosis or cause nobody has assessed',
  },
  {
    pattern: /\b(antibiotic\w*|iv fluids?|intravenous|medicat\w*|prescri\w*|dose|dosage|\d+\s?mg|tylenol|acetaminophen|catheter\w*)\b/i,
    why: 'gives a treatment or medication instruction',
  },
  {
    pattern: /\b(is safe|she'?s safe|he'?s safe|nothing to worry about|no need to worry|no cause for concern|nothing wrong)\b/i,
    why: 'reassures without evidence',
  },
]

export interface LanguageIssue {
  match: string
  why: string
}

export function languageIssues(text: string): LanguageIssue[] {
  const issues: LanguageIssue[] = []
  for (const r of RULES) {
    const m = text.replace(/’/g, "'").match(r.pattern)
    if (m) issues.push({ match: m[0], why: r.why })
  }
  return issues
}
