import type { State } from './types'

const DAY = new Intl.DateTimeFormat('en-CA', { weekday: 'short' })

/** 'Mon 09:10' in facility time. Timestamps from the API are naive facility-local ISO strings. */
export function when(iso: string): string {
  const d = new Date(iso)
  return `${DAY.format(d)} ${hhmm(iso)}`
}

export function hhmm(iso: string): string {
  return iso.slice(11, 16)
}

export function ago(fromIso: string, toIso: string): string {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export const STATE_META: Record<State, { label: string; short: string; color: string; soft: string; blurb: string }> = {
  persistent_signal: {
    label: 'Persistent signal',
    short: 'Persistent',
    color: 'var(--color-persistent)',
    soft: 'var(--color-persistent-soft)',
    blurb: 'A later observation still meets the concern rule.',
  },
  new_signal: {
    label: 'New signal',
    short: 'New',
    color: 'var(--color-newsignal)',
    soft: 'var(--color-newsignal-soft)',
    blurb: 'A concerning observation with no response documented yet.',
  },
  unverified: {
    label: 'Unverified',
    short: 'Unverified',
    color: 'var(--color-unverified)',
    soft: 'var(--color-unverified-soft)',
    blurb: 'A response was documented; the records do not establish the outcome.',
  },
  ambiguous: {
    label: 'Ambiguous',
    short: 'Ambiguous',
    color: 'var(--color-ambiguous)',
    soft: 'var(--color-ambiguous-soft)',
    blurb: 'The evidence is too unclear to judge without checking.',
  },
  response_documented: {
    label: 'Response documented',
    short: 'Watching',
    color: 'var(--color-watching)',
    soft: 'var(--color-watching-soft)',
    blurb: 'A response is recorded and the follow-up window is still open.',
  },
  outcome_verified: {
    label: 'Outcome verified',
    short: 'Verified',
    color: 'var(--color-verified)',
    soft: 'var(--color-verified-soft)',
    blurb: 'Later evidence meets the demonstration resolution rule.',
  },
}

export function displayName(r: { name?: string; display_name?: string; preferred_name: string | null }): string {
  const full = r.name ?? r.display_name ?? ''
  const first = full.split(' ')[0]
  return r.preferred_name && r.preferred_name !== first ? `${full} (“${r.preferred_name}”)` : full
}
