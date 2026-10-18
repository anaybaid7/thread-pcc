/**
 * The ward model. Everything is synthetic. Time is minutes since Monday 00:00 of the demo week.
 *
 * The ward's history is an append-only list of events. Every screen is derived from it, so any state can be replayed
 * and every flag on screen can be traced to the events behind it.
 */

export type Area = 'mobility' | 'eating' | 'drinking' | 'mood' | 'thinking' | 'sleep' | 'pain' | 'breathing'

export const AREAS: Record<Area, { label: string; options: string[] }> = {
  mobility: { label: 'Mobility', options: ['Stayed in bed or room', 'Needed help to walk', 'Unsteady on feet'] },
  eating: { label: 'Eating', options: ['Ate about a quarter', 'Ate about half', 'Refused the meal'] },
  drinking: { label: 'Drinking', options: ['Drank less than usual', 'Refused drinks', 'Cup left full'] },
  mood: { label: 'Mood and engagement', options: ['Quieter than usual', 'Skipped usual activity', 'Upset or restless'] },
  thinking: { label: 'Thinking', options: ['Unsure of day or place', 'Called staff by wrong name', 'Harder to follow'] },
  sleep: { label: 'Sleep and energy', options: ['Very sleepy', 'Up a lot overnight'] },
  pain: { label: 'Pain', options: ['Says it hurts', 'Wincing or guarding'] },
  breathing: { label: 'Breathing', options: ['Coughing more', 'Short of breath'] },
}

export interface Range {
  lo: number
  hi: number
}

export interface Resident {
  id: string
  name: string
  preferred: string
  pronoun: 'she' | 'he'
  age: number
  room: string
  /** What is usual for this person, in their care plan's words. Only these areas are checked. */
  usual: Partial<Record<Area, string>>
  /** This person's usual ranges (synthetic), so readings are compared with them, not with a population. */
  vitals: { temp: Range; pulse: Range; sbp: Range; spo2: Range }
  /** Usual fluids per day, mL. */
  fluids: number
  assignedTo: string
}

export interface Staff {
  id: string
  name: string
  role: 'PSW' | 'RPN' | 'NP' | 'Activity aide'
  shift: 'day' | 'evening' | 'any'
}

export type MeasureKind = 'temp' | 'pulse' | 'sbp' | 'spo2' | 'fluids' | 'walk' | 'orientation' | 'pain'

export const MEASURES: Record<MeasureKind, { label: string; unit: string; area: Area | null; choices?: string[] }> = {
  temp: { label: 'Temperature', unit: '°C', area: null },
  pulse: { label: 'Pulse', unit: 'bpm', area: null },
  sbp: { label: 'Blood pressure (systolic)', unit: 'mmHg', area: null },
  spo2: { label: 'Oxygen saturation', unit: '%', area: 'breathing' },
  fluids: { label: 'Fluids drunk since 07:00, measured', unit: 'mL', area: 'drinking' },
  walk: { label: 'Walking', unit: '', area: 'mobility', choices: ['Walked as usual', 'Needed help', 'Did not walk'] },
  orientation: { label: 'Orientation', unit: '', area: 'thinking', choices: ['As usual', 'Not as usual'] },
  pain: { label: 'Pain, 0 to 10', unit: '/10', area: 'pain' },
}

export type Event =
  | { type: 'observe'; id: string; at: number; by: string; residentId: string; area: Area; usual: boolean; finding: string; quote?: string }
  | { type: 'report'; id: string; at: number; by: string; residentId: string; observed: string[]; unknown: Area[] }
  | { type: 'offer'; id: string; at: number; by: string; residentId: string; what: string }
  | { type: 'measure'; id: string; at: number; by: string; residentId: string; kind: MeasureKind; value: number | string }
  | {
      type: 'plan'
      id: string
      at: number
      by: string
      concernId: string
      decision: 'watch' | 'escalate'
      recheckAt: number
      recheck: Area[]
      to?: string
      sbar?: Sbar
    }
  | { type: 'open'; id: string; at: number; by: string; residentId: string; reason: string }
  | { type: 'resolve'; id: string; at: number; by: string; concernId: string; evidence: string[] }
  | { type: 'ack'; id: string; at: number; by: string; key: string; handoverAt: number }

export interface Sbar {
  situation: string
  background: string
  assessment: string
  recommendation: string
  source: 'gemini' | 'template' | 'edited'
}

/** What the people on screen ask the ward to do. The engine stamps time and ids. */
export type Command =
  | { type: 'checkin'; by: string; residentId: string; findings: { area: Area; status: 'usual' | 'different' | 'unchecked'; finding?: string }[]; quote?: string }
  | { type: 'measure'; by: string; residentId: string; kind: MeasureKind; value: number | string }
  | { type: 'plan'; by: string; concernId: string; decision: 'watch' | 'escalate'; recheckIn: number; recheck: Area[]; to?: string; sbar?: Sbar }
  | { type: 'open'; by: string; residentId: string; reason: string }
  | { type: 'resolve'; by: string; concernId: string }
  | { type: 'ack'; by: string; key: string }
  | { type: 'advance'; to: number }

export interface Ward {
  now: number
  events: Event[]
}
