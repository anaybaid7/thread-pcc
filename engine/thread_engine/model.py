"""Domain model.

Two ideas carry the whole design and are encoded here rather than left to the UI:

* A *completed action* is not a *resolved concern*. Event modality (done / planned / negated) and thread state
  (response_documented vs outcome_verified) are separate fields, so nothing collapses into `resolved: bool`.
* *Not documented* is not *not done*. Missing follow-up evidence becomes an explicit `Gap` and the `unverified`
  state, never a failure.

Times are facility-local and naive. Every event keeps two of them: when it happened (`event_time`) and when it was
entered (`recorded_at`), so a late entry is placed where it belongs without pretending staff knew about it earlier.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Domain = Literal["hydration", "mobility"]
Shift = Literal["day", "evening", "night"]
Role = Literal["PSW", "RPN", "RN", "NP", "Dietitian", "Physio", "Family", "System"]
SourceType = Literal["fluid_round", "mobility_check", "progress_note", "verification"]
Extractor = Literal["structured", "context_rules", "keyword", "llm", "human"]


class Model(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# --------------------------------------------------------------------------------------------------- inputs


class Resident(Model):
    resident_id: str
    display_name: str
    preferred_name: str | None = None
    room: str
    wing: str
    age: int
    synthetic_profile: str
    """One or two lines a colleague would say at handover. Fictional."""
    preferences: list[str] = []
    """Care-plan personal preferences the suggested next step can draw on."""
    communication: list[str] = []


class CarePlanRule(Model):
    """A resident-specific target from the (synthetic) care plan, plus the demonstration resolution rule."""

    rule_id: str
    resident_id: str
    domain: Domain
    metric: Literal["fluid_round_ml", "assist_level"]
    operator: Literal[">=", "<="]
    threshold: float
    unit: str
    valid_from: datetime
    description: str
    resolution_window_hours: float = 8.0
    """Demonstration rule, not clinical guidance: a measurement meeting the target within this many hours of the
    documented response counts as verified outcome evidence."""
    baseline_documented: bool = True
    """False when the care plan does not establish a baseline, so a described change cannot be judged."""

    def meets(self, value: float) -> bool:
        return value >= self.threshold if self.operator == ">=" else value <= self.threshold


class SourceRecord(Model):
    """A record exactly as the care team entered it: a structured measurement or a free-text note."""

    source_id: str
    resident_id: str
    source_type: SourceType
    event_time: datetime
    recorded_at: datetime
    author: str
    author_role: Role
    value: float | None = None
    unit: str | None = None
    text: str | None = None
    import_batch: str | None = None
    """Set on structured records that arrived through an interface import, so re-imports can be recognised."""


# --------------------------------------------------------------------------------------------------- events


class EventKind(StrEnum):
    OBSERVATION = "observation"
    """Something seen or measured: an intake amount, an assist level, 'took a few sips'."""
    INTERVENTION = "intervention"
    """Something staff did: offered a drink, assisted, set up the walker."""
    PLAN = "plan"
    """Something staff intend to do: 'will reassess after supper'. Never evidence it happened."""
    REFUSAL = "refusal"
    ASSESSMENT = "assessment"
    ESCALATION = "escalation"
    """Notified the nurse, NP, physician or family."""


class Modality(StrEnum):
    DONE = "done"
    PLANNED = "planned"
    NEGATED = "negated"
    HYPOTHETICAL = "hypothetical"


class Polarity(StrEnum):
    BELOW_TARGET = "below_target"
    MEETS_TARGET = "meets_target"
    WORSE = "worse"
    BETTER = "better"
    UNCLEAR = "unclear"
    NEUTRAL = "neutral"


class Span(Model):
    start: int
    end: int
    text: str


class ClinicalEvent(Model):
    event_id: str
    resident_id: str
    domain: Domain | None
    """None when the extractor could not tell which concern the sentence is about."""
    kind: EventKind
    modality: Modality
    polarity: Polarity
    event_time: datetime
    recorded_at: datetime
    shift: Shift
    source_id: str
    source_type: SourceType
    author: str
    author_role: Role
    summary: str
    span: Span | None = None
    value: float | None = None
    unit: str | None = None
    approximate: bool = False
    extractor: Extractor
    confidence: float = Field(ge=0, le=1)
    """How sure the extractor is that it read the source correctly. Not a clinical probability."""
    triggers: list[str] = []
    """The cues that decided the reading, e.g. "planned: 'will'", shown to the user verbatim."""
    flags: list[str] = []
    """late_entry, duplicate_import, approximate, reported_by_other, time_from_text, other_subject."""
    duplicate_of: str | None = None

    @property
    def is_signal(self) -> bool:
        """A concerning observation that can open or extend a thread."""
        if self.modality != Modality.DONE or self.duplicate_of:
            return False
        if self.kind == EventKind.REFUSAL:
            return True
        return self.kind in (EventKind.OBSERVATION, EventKind.ASSESSMENT) and self.polarity in (
            Polarity.BELOW_TARGET,
            Polarity.WORSE,
        )

    @property
    def is_response(self) -> bool:
        return self.modality == Modality.DONE and self.kind in (EventKind.INTERVENTION, EventKind.ESCALATION)

    @property
    def is_measured(self) -> bool:
        return self.value is not None and self.polarity in (Polarity.BELOW_TARGET, Polarity.MEETS_TARGET)


# --------------------------------------------------------------------------------------------------- threads


class Relationship(StrEnum):
    RESPONDS_TO = "responds_to"
    FOLLOWS_UP = "follows_up"
    RECURS = "recurs"
    CONTRADICTS = "contradicts"
    PLANS_FOR = "plans_for"
    DUPLICATES = "duplicates"


class EvidenceLink(Model):
    source_event_id: str
    target_event_id: str
    relationship: Relationship
    confidence: float = Field(ge=0, le=1)
    evidence_text: str
    """One line saying why the two events were connected."""


class ThreadState(StrEnum):
    NEW_SIGNAL = "new_signal"
    RESPONSE_DOCUMENTED = "response_documented"
    OUTCOME_VERIFIED = "outcome_verified"
    PERSISTENT_SIGNAL = "persistent_signal"
    UNVERIFIED = "unverified"
    AMBIGUOUS = "ambiguous"


NEEDS_REVIEW = frozenset(
    {ThreadState.NEW_SIGNAL, ThreadState.PERSISTENT_SIGNAL, ThreadState.UNVERIFIED, ThreadState.AMBIGUOUS}
)
"""States that put a thread in the review queue. response_documented is still inside its window and is watched,
not escalated; outcome_verified is closed under the demonstration rule."""


class ReasonCode(StrEnum):
    RECURRENT_SIGNAL = "recurrent_signal"
    NO_RESPONSE_DOCUMENTED = "no_response_documented"
    RESPONSE_WITHOUT_OUTCOME = "response_without_outcome"
    PLANNED_NOT_CONFIRMED = "planned_not_confirmed"
    QUALITATIVE_ONLY = "qualitative_only"
    CONTRADICTORY_EVIDENCE = "contradictory_evidence"
    AMBIGUOUS_NOTE = "ambiguous_note"
    BASELINE_UNKNOWN = "baseline_unknown"
    REFUSAL_DOCUMENTED = "refusal_documented"
    LATE_ENTRY = "late_entry"
    DUPLICATE_COLLAPSED = "duplicate_collapsed"
    CROSSED_SHIFTS = "crossed_shifts"
    OUTCOME_MET_RULE = "outcome_met_rule"
    WITHIN_WINDOW = "within_window"


class StepLabel(StrEnum):
    """What THREAD can legitimately say about one event, shown on its card."""

    OBSERVED = "Observed"
    DOCUMENTED = "Documented"
    PLANNED = "Planned only"
    VERIFIED = "Verified"
    NEEDS_REVIEW = "Needs review"
    CONTRADICTS = "Contradicts"
    UNCLEAR = "Unclear"
    CONTEXT = "Context"


class ThreadStep(Model):
    event_id: str
    role: Literal["signal", "response", "plan", "outcome", "recurrence", "contradiction", "context"]
    label: StepLabel
    note: str


class Gap(Model):
    """Expected evidence that the supplied records do not contain. An evidence gap, not a failure of care."""

    after_event_id: str
    start: datetime
    end: datetime
    description: str


class CitedSentence(Model):
    text: str
    cites: list[str] = []


class Validation(Model):
    ok: bool
    issues: list[str] = []


class Explanation(Model):
    sentences: list[CitedSentence]
    next_step: CitedSentence
    generator: Literal["template", "llm"] = "template"
    validation: Validation


class ReviewAction(Model):
    action_id: str
    thread_id: str | None
    resident_id: str
    action_type: Literal["verify_current_status", "mark_reviewed", "note_added", "handover_saved"]
    actor: str
    actor_role: Role
    timestamp: datetime
    note: str = ""
    value: float | None = None


class ConcernThread(Model):
    thread_id: str
    resident_id: str
    domain: Domain
    state: ThreadState
    first_seen: datetime
    last_seen: datetime
    last_signal_at: datetime
    reason_codes: list[ReasonCode]
    events: list[ClinicalEvent]
    links: list[EvidenceLink]
    steps: list[ThreadStep]
    gaps: list[Gap]
    shifts_spanned: list[str]
    """Shift instances the thread crosses, e.g. ['Mon day', 'Mon evening', 'Tue day']."""
    explanation: Explanation
    review_rank: int
    """Lower is reviewed first. Derived from the reason, never from an opaque score."""
    review_reason: str
    reviews: list[ReviewAction] = []
    as_of: datetime

    @property
    def needs_review(self) -> bool:
        return self.state in NEEDS_REVIEW
