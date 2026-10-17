// Mirrors the API (api/thread_api/views.py) and the engine model (engine/thread_engine/model.py).

export type State =
  | 'persistent_signal'
  | 'new_signal'
  | 'unverified'
  | 'ambiguous'
  | 'response_documented'
  | 'outcome_verified'
export type Domain = 'hydration' | 'mobility'

export interface ResidentCard {
  resident_id: string
  name: string
  preferred_name: string | null
  room: string
  wing: string
  age: number
}

export interface Resident extends Omit<ResidentCard, 'name'> {
  display_name: string
  synthetic_profile: string
  preferences: string[]
  communication: string[]
}

export interface Checkpoint {
  at: string
  label: string
}

export interface Meta {
  facility: string
  wings: string[]
  now: string
  as_of: string
  shift: string
  checkpoints: Checkpoint[]
  residents: number
  synthetic: boolean
  demonstration_rule: string
  llm: { available: boolean; model: string }
}

export interface Reason {
  code: string
  label: string
}

export interface ReviewAction {
  action_id: string
  thread_id: string | null
  resident_id: string
  action_type: 'verify_current_status' | 'mark_reviewed' | 'note_added' | 'handover_saved'
  actor: string
  actor_role: string
  timestamp: string
  note: string
  value: number | null
}

export interface ThreadSummary {
  thread_id: string
  resident: ResidentCard
  domain: Domain
  domain_label: string
  state: State
  state_label: string
  needs_review: boolean
  review_rank: number
  review_reason: string
  reasons: Reason[]
  counts: { signals: number; responses: number; plans: number; gaps: number; notes: number }
  first_seen: string
  last_signal_at: string
  last_seen: string
  shifts_spanned: string[]
  headline: string
  last_reviewed: ReviewAction | null
}

export interface Span {
  start: number
  end: number
  text: string
}

export interface ClinicalEvent {
  event_id: string
  resident_id: string
  domain: Domain | null
  kind: 'observation' | 'intervention' | 'plan' | 'refusal' | 'assessment' | 'escalation'
  modality: 'done' | 'planned' | 'negated' | 'hypothetical'
  polarity: 'below_target' | 'meets_target' | 'worse' | 'better' | 'unclear' | 'neutral'
  event_time: string
  recorded_at: string
  shift: 'day' | 'evening' | 'night'
  source_id: string
  source_type: 'fluid_round' | 'mobility_check' | 'progress_note' | 'verification'
  author: string
  author_role: string
  summary: string
  span: Span | null
  value: number | null
  unit: string | null
  approximate: boolean
  extractor: 'structured' | 'context_rules' | 'keyword' | 'llm' | 'human'
  confidence: number
  triggers: string[]
  flags: string[]
  duplicate_of: string | null
}

export interface EvidenceLink {
  source_event_id: string
  target_event_id: string
  relationship: 'responds_to' | 'follows_up' | 'recurs' | 'contradicts' | 'plans_for' | 'duplicates' | 'relays'
  confidence: number
  evidence_text: string
}

export interface ThreadStep {
  event_id: string
  role: 'signal' | 'response' | 'plan' | 'outcome' | 'recurrence' | 'contradiction' | 'context'
  label: string
  note: string
}

export interface Gap {
  after_event_id: string
  start: string
  end: string
  description: string
}

export interface CitedSentence {
  text: string
  cites: string[]
}

export interface Thread {
  thread_id: string
  resident_id: string
  domain: Domain
  state: State
  first_seen: string
  last_seen: string
  last_signal_at: string
  reason_codes: string[]
  events: ClinicalEvent[]
  links: EvidenceLink[]
  steps: ThreadStep[]
  gaps: Gap[]
  shifts_spanned: string[]
  explanation: {
    sentences: CitedSentence[]
    next_step: CitedSentence
    generator: 'template' | 'llm'
    validation: { ok: boolean; issues: string[] }
  } | null
  review_rank: number
  review_reason: string
  reviews: ReviewAction[]
  as_of: string
}

export interface SourceRecord {
  source_id: string
  resident_id: string
  source_type: ClinicalEvent['source_type']
  event_time: string
  recorded_at: string
  author: string
  author_role: string
  value: number | null
  unit: string | null
  text: string | null
  import_batch: string | null
  in_thread: boolean
}

export interface CarePlanRule {
  rule_id: string
  domain: Domain
  metric: string
  operator: string
  threshold: number
  unit: string
  description: string
  resolution_window_hours: number
  baseline_documented: boolean
}

export interface ThreadDetail {
  summary: ThreadSummary
  thread: Thread
  labels: Record<string, string>
  resident: Resident
  rule: CarePlanRule | null
  replay: { at: string; label: string; state: State | null; state_label: string; events: number }[]
  sources: SourceRecord[]
}

export interface Unlinked {
  event: ClinicalEvent
  reason: string
  resident: ResidentCard
}

export interface Queue {
  as_of: string
  counts: Record<
    'open' | 'unverified' | 'new_signals' | 'persistent' | 'ambiguous' | 'watching' | 'verified' | 'unlinked' | 'residents',
    number
  >
  items: ThreadSummary[]
  watching: ThreadSummary[]
  closed: ThreadSummary[]
  unlinked: Unlinked[]
}

export interface HandoverItem extends ThreadSummary {
  sentences: { text: string; cites: string[]; event_ids: string[] }[]
  next_step: string
  new_since: { label: string; time: string; summary: string; author: string }[]
}

export interface Handover {
  as_of: string
  label: string
  previous: string | null
  previous_label: string | null
  items: HandoverItem[]
  more: number
  watching: ThreadSummary[]
  closed: ThreadSummary[]
  unlinked: number
  saved: { id: number; as_of: string; saved_at: string; author: string; items: { thread_id: string; text: string }[] } | null
}

export interface KeywordReading {
  sentence: string
  kind: string
  polarity: string
  value: number | null
  why: string
}

export interface LabResult {
  text: string
  resident: ResidentCard
  events: ClinicalEvent[]
  keyword: KeywordReading[]
  llm: { model?: string; error?: string; events: ClinicalEvent[]; rejected: { quote: string; reason: string }[] } | null
}

export interface ResidentRow extends ResidentCard {
  threads: { thread_id: string; domain: Domain; state: State }[]
  needs_review: boolean
}

export interface AuditRow {
  id: number
  at: string
  actor: string
  action: string
  detail: string
  thread_id: string | null
}
