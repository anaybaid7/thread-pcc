"""Labelled scenarios for evaluation, with ground truth by construction.

Each scenario is one fictional resident over about a day. The expected state, whether it needs review, the links
between records and the events in every note all come from the scenario's specification, never from running the
engine.

Two splits use different phrasings:

* dev       phrasings in the style of the demo facility. The extractor was developed against notes like these.
* held_out  phrasings written separately (other verbs, abbreviations, word order) and never used to tune the
            extractor. Results on this split are the honest ones.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .model import CarePlanRule, Resident, Role, SourceRecord, ThreadState

DAY = datetime(2026, 10, 19)

# Gold note events: (kind, modality, polarity class). Polarity class collapses to low / ok / neutral.
Gold = tuple[str, str, str]
RESPONSE: Gold = ("intervention", "done", "neutral")
PLANNED_RESPONSE: Gold = ("intervention", "planned", "neutral")
PLANNED_ASSESS: Gold = ("assessment", "planned", "neutral")
ASSESS: Gold = ("assessment", "done", "neutral")
LOW: Gold = ("observation", "done", "low")
OK: Gold = ("observation", "done", "ok")
NEUTRAL_OBS: Gold = ("observation", "done", "neutral")
REFUSAL: Gold = ("refusal", "done", "low")
ESCALATION: Gold = ("escalation", "done", "neutral")


@dataclass(frozen=True)
class Phrase:
    text: str
    gold: tuple[Gold, ...]


# ------------------------------------------------------------------------------------------------ phrase banks
# {drink} is filled per resident. Each bank entry lists the events a careful reader finds in it.

DEV = {
    "response": [
        Phrase("Offered {drink}; assistance provided.", (RESPONSE, RESPONSE)),
        Phrase("Encouraged fluids. Set up {drink} within reach.", (RESPONSE, RESPONSE)),
        Phrase("Offered {drink} x2, stayed with res while she drank.", (RESPONSE, NEUTRAL_OBS)),
        Phrase("Encouraged {drink} x2.", (RESPONSE,)),
    ],
    "plan": [
        Phrase("Will reassess fluid intake after supper.", (PLANNED_ASSESS,)),
        Phrase("Will offer {drink} again after supper.", (PLANNED_RESPONSE,)),
        Phrase("Continue to encourage fluids.", (PLANNED_RESPONSE,)),
    ],
    "vague": [
        Phrase("Didn't do well with drinks today.", (LOW,)),
        Phrase("Low fluids this shift.", (LOW,)),
    ],
    "better_reported": [
        Phrase("Fluid intake much improved this evening per PSW.", (OK,)),
        Phrase("Drinking better tonight per family.", (OK,)),
    ],
    "refusal": [
        Phrase("Res refused fluids at afternoon round.", (REFUSAL,)),
        Phrase("Declined water when offered.", (REFUSAL, RESPONSE)),
    ],
    "late_meets": [
        Phrase("Late entry for {hhmm}: assisted res with {drink} at lunch, drank approx {ml} mL.", (RESPONSE, OK)),
    ],
    "offered_amount": [Phrase("Offered {ml} mL of {drink}.", (RESPONSE,))],
    "no_improvement": [Phrase("No improvement in fluid intake noted.", (LOW,))],
    "not_well": [Phrase("Res not drinking well at lunch.", (LOW,))],
    "plan_only_response": [Phrase("Will push fluids and reassess later.", (PLANNED_RESPONSE, PLANNED_ASSESS))],
    "positive": [
        Phrase("Enjoyed the music program, drank well.", (OK,)),
        Phrase("Drank a full glass of {drink} with lunch.", (OK,)),
    ],
    "roommate": [Phrase("Roommate refused her afternoon drink, reported to RPN.", ())],
    "neutral": [Phrase("Res settled for the night, no concerns voiced.", ()), Phrase("Slept well.", ())],
    "mob_worse": [
        Phrase("Res unsteady on feet standing up, needed 1 assist to transfer.", (LOW,)),
        Phrase("Walked to dining room but only made it halfway, needed to sit and rest.", (NEUTRAL_OBS, LOW)),
    ],
    "mob_response": [
        Phrase("Physio reviewed gait. Walker height adjusted.", (ASSESS, RESPONSE)),
        Phrase("Assessed res, no injury. Bed lowered, call bell within reach.", (ASSESS, RESPONSE)),
    ],
}

HELD_OUT = {
    "response": [
        Phrase("Res given {drink} and prompted to sip.", (RESPONSE,)),
        Phrase("Fluids pushed, {drink} brought to bedside and cued x3.", (RESPONSE,)),
        Phrase("Assisted w/ {drink} at bedside, hand over hand.", (RESPONSE,)),
        Phrase("Refilled water jug and reminded res to drink.", (RESPONSE,)),
    ],
    "plan": [
        Phrase("Plan to recheck intake at HS.", (PLANNED_ASSESS,)),
        Phrase("To offer {drink} q1h this evening.", (PLANNED_RESPONSE,)),
        Phrase("Pls encourage fluids on next round.", (PLANNED_RESPONSE,)),
    ],
    "vague": [
        Phrase("Poor po intake this shift.", (LOW,)),
        Phrase("Not really drinking much today?", (LOW,)),
    ],
    "better_reported": [
        Phrase("As per family, drinking much better this evening.", (OK,)),
        Phrase("PSW reports intake improved after supper.", (OK,)),
    ],
    "refusal": [
        Phrase("Declined all drinks offered this pm, stated not thirsty.", (REFUSAL, RESPONSE)),
        Phrase("Res pushed cup away at 1400 round, would not drink.", (REFUSAL,)),
    ],
    "late_meets": [
        Phrase("Late entry, care at {hhmm}: res finished {ml} mL {drink} with set up.", (RESPONSE, OK)),
    ],
    "offered_amount": [Phrase("{ml} mL {drink} offered at bedside.", (RESPONSE,))],
    "no_improvement": [Phrase("Intake has not improved since AM.", (LOW,))],
    "not_well": [Phrase("Didn't drink well at lunch.", (LOW,))],
    "plan_only_response": [
        Phrase("Need to push fluids, will reassess this evening.", (PLANNED_RESPONSE, PLANNED_ASSESS)),
    ],
    "positive": [
        Phrase("Good fluid intake today, finished jug.", (OK,)),
        Phrase("Res drank 2 cups of {drink} at tea time.", (OK,)),
    ],
    "roommate": [Phrase("Tablemate declined her juice, RPN made aware.", ())],
    "neutral": [Phrase("Quiet evening, watched TV in lounge.", ()), Phrase("Res asleep on rounds x3.", ())],
    "mob_worse": [
        Phrase("Gait shuffling today, required 1 staff to ambulate to bathroom.", (LOW,)),
        Phrase("Res wobbly when standing from w/c, needed assist x1.", (LOW,)),
    ],
    "mob_response": [
        Phrase("Rollator brakes checked and adjusted. Hip protectors applied.", (RESPONSE, RESPONSE)),
        Phrase("RN assessed gait, no pain. Reminded to use call bell before getting up.", (ASSESS, RESPONSE)),
    ],
}

DRINKS = ["iced tea", "apple juice", "warm water with lemon", "ginger ale", "cranberry juice", "decaf coffee",
          "orange juice", "milky tea"]
FIRST = ["Margaret", "Henri", "Ada", "Kenji", "Olive", "Bernard", "Lucia", "Desmond", "Fatima", "Ivan", "Nora",
         "Gordon", "Esther", "Amir", "Pauline", "Stanley", "Rita", "Wilfred", "Maeve", "Tobias", "Hazel", "Ronald",
         "Ines", "Arthur", "Celeste", "Leopold", "Winnie", "Raymond", "Sunita", "Clarence", "Greta", "Felix"]
LAST = ["Abbott", "Leclerc", "Novak", "Tanaka", "Moreau", "Osei", "Fischer", "Lindqvist", "Haddad", "Petrov",
        "MacLeod", "Rossi", "Nakamura", "Dubois", "Mbeki", "O'Neill", "Sandoval", "Kowal", "Bergstrom", "Adeyemi"]
STAFF: list[tuple[str, Role]] = [("PSW Mira D.", "PSW"), ("PSW Tom H.", "PSW"), ("RPN Ana P.", "RPN"),
                                 ("RN Chris W.", "RN"), ("PSW Grace L.", "PSW")]


@dataclass
class Scenario:
    scenario_id: str
    family: str
    description: str
    split: str
    resident: Resident
    rules: list[CarePlanRule]
    records: list[SourceRecord]
    as_of: datetime
    expected_state: ThreadState | None
    gold_links: set[tuple[str, str, str]] = field(default_factory=set)
    gold_note_events: dict[str, list[Gold]] = field(default_factory=dict)
    expected_before: tuple[datetime, ThreadState | None] | None = None
    """Optional replay check: the state an earlier handover should have seen."""

    @property
    def needs_review(self) -> bool:
        return self.expected_state in (ThreadState.NEW_SIGNAL, ThreadState.PERSISTENT_SIGNAL,
                                       ThreadState.UNVERIFIED, ThreadState.AMBIGUOUS)


class _Build:
    def __init__(self, sid: str, rng: random.Random, bank: dict[str, list[Phrase]], domain: str = "hydration"):
        self.sid, self.rng, self.bank = sid, rng, bank
        self.rid = f"S{sid}"
        self.target = rng.choice([200, 250, 250, 300])
        self.drink = rng.choice(DRINKS)
        self.records: list[SourceRecord] = []
        self.gold: dict[str, list[Gold]] = {}
        self.links: set[tuple[str, str, str]] = set()
        self.domain = domain
        self.n = 0

    def _id(self, prefix: str) -> str:
        self.n += 1
        return f"{prefix}-{self.sid}-{self.n}"

    def at(self, hours: float) -> datetime:
        """Hours after Monday 07:00, rounded to five minutes."""
        t = DAY + timedelta(hours=7 + hours)
        return t.replace(minute=(t.minute // 5) * 5, second=0, microsecond=0)

    def staff(self) -> tuple[str, Role]:
        return self.rng.choice(STAFF)

    def round(self, hours: float, ml: float, recorded_after: float = 0.07, batch: str = "POC-1") -> str:
        t = self.at(hours)
        who = self.staff()
        sid = self._id("F")
        self.records.append(SourceRecord(source_id=sid, resident_id=self.rid, source_type="fluid_round",
                                         event_time=t, recorded_at=t + timedelta(hours=recorded_after),
                                         author=who[0], author_role=who[1], value=ml, unit="mL", import_batch=batch))
        return sid

    def check(self, hours: float, assist: int) -> str:
        t = self.at(hours)
        who = self.staff()
        sid = self._id("M")
        self.records.append(SourceRecord(source_id=sid, resident_id=self.rid, source_type="mobility_check",
                                         event_time=t, recorded_at=t + timedelta(minutes=5), author=who[0],
                                         author_role=who[1], value=assist, unit="staff assist"))
        return sid

    def note(self, hours: float, kind: str, recorded_hours: float | None = None, **fill) -> str:
        phrase = self.rng.choice(self.bank[kind])
        t = self.at(hours)
        text = phrase.text.format(drink=self.drink, **fill)
        text = text[0].upper() + text[1:]
        who = self.staff()
        sid = self._id("N")
        rec = self.at(recorded_hours) if recorded_hours is not None else t + timedelta(minutes=10)
        self.records.append(SourceRecord(source_id=sid, resident_id=self.rid, source_type="progress_note",
                                         event_time=t if recorded_hours is None else rec, recorded_at=rec,
                                         author=who[0], author_role=who[1], text=text))
        self.gold[sid] = list(phrase.gold)
        return sid

    def link(self, src: str, rel: str, tgt: str) -> None:
        self.links.add((src, rel, tgt))

    def low(self) -> float:
        return float(self.rng.randrange(40, int(self.target * 0.6), 10))

    def ok(self) -> float:
        return float(self.rng.randrange(self.target, self.target + 120, 10))

    def scenario(self, family: str, description: str, split: str, expected: ThreadState | None, as_of: datetime,
                 baseline: bool = True, before: tuple[datetime, ThreadState | None] | None = None) -> Scenario:
        name = f"{self.rng.choice(FIRST)} {self.rng.choice(LAST)}"
        resident = Resident(resident_id=self.rid, display_name=name, room=self.sid, wing="Eval",
                            age=self.rng.randint(72, 99), synthetic_profile="Evaluation scenario (synthetic).",
                            preferences=[f"Likes {self.drink}"])
        rules = [CarePlanRule(rule_id=f"{self.rid}-hyd", resident_id=self.rid, domain="hydration",
                              metric="fluid_round_ml", operator=">=", threshold=self.target, unit="mL",
                              valid_from=DAY - timedelta(days=30), description="Evaluation target."),
                 CarePlanRule(rule_id=f"{self.rid}-mob", resident_id=self.rid, domain="mobility",
                              metric="assist_level", operator="<=", threshold=0, unit="staff assist",
                              valid_from=DAY - timedelta(days=30), description="Evaluation baseline.",
                              resolution_window_hours=12, baseline_documented=baseline)]
        return Scenario(scenario_id=f"{split[0].upper()}{self.sid}", family=family, description=description,
                        split=split, resident=resident, rules=rules,
                        records=sorted(self.records, key=lambda r: (r.recorded_at, r.source_id)), as_of=as_of,
                        expected_state=expected, gold_links=self.links, gold_note_events=self.gold,
                        expected_before=before)


S = ThreadState


def _family_builders():
    """Each builder takes a _Build and returns a Scenario. Times are hours after Monday 07:00."""

    def persistent(b: _Build, split):
        r1 = b.round(2, b.low())
        n = b.note(2.8, "response")
        r2 = b.round(b.rng.choice([5.5, 6, 7]), b.low())
        b.link(n, "responds_to", r1)
        b.link(r2, "recurs", r1)
        return b.scenario("A", "Low round, response, low again", split, S.PERSISTENT_SIGNAL, b.at(26))

    def missing_outcome(b, split):
        r1 = b.round(b.rng.choice([2, 6]), b.low())
        n = b.note(b.rng.choice([6.5, 7]), "response")
        b.link(n, "responds_to", r1)
        return b.scenario("B", "Response documented, no follow-up measurement", split, S.UNVERIFIED, b.at(26))

    def success(b, split):
        r1 = b.round(2, b.low())
        n = b.note(2.6, "response")
        b.round(b.rng.choice([5, 6]), b.ok())
        b.link(n, "responds_to", r1)
        return b.scenario("C", "Response then a round meeting target", split, S.OUTCOME_VERIFIED, b.at(26))

    def delayed(b, split):
        r1 = b.round(2, b.low())
        lunch = b.at(4.5)
        n = b.note(4.5, "late_meets", recorded_hours=11.3, hhmm=f"{lunch:%H:%M}", ml=int(b.ok()))
        b.link(n, "responds_to", r1)
        return b.scenario("D", "Meeting intake entered late", split, S.OUTCOME_VERIFIED, b.at(26),
                          before=(b.at(8), S.NEW_SIGNAL))

    def ambiguous(b, split):
        b.round(2, b.ok())
        b.round(6, b.ok())
        b.note(12, "vague")
        return b.scenario("E", "Vague note, no amount", split, S.AMBIGUOUS, b.at(26))

    def duplicate(b, split):
        r1 = b.round(6, b.low())
        r1b = b.round(6, b.records[-1].value, recorded_after=0.6, batch="POC-1-retry")
        n = b.note(6.4, "response")
        b.round(10, b.ok())
        b.link(n, "responds_to", r1)
        b.link(r1b, "duplicates", r1)
        return b.scenario("F", "Re-imported low round, then met", split, S.OUTCOME_VERIFIED, b.at(26))

    def contradiction(b, split):
        r1 = b.round(6, b.low())
        n = b.note(7, "response")
        r2 = b.round(10, b.low())
        c = b.note(10.5, "better_reported")
        b.link(n, "responds_to", r1)
        b.link(r2, "recurs", r1)
        b.link(c, "contradicts", r2)
        return b.scenario("G", "A note says better; the round says otherwise", split, S.PERSISTENT_SIGNAL, b.at(26))

    def cross_shift(b, split):
        r1 = b.round(2, b.low())
        n1 = b.note(3, "response")
        p = b.note(9.5, "plan")
        rf = b.note(20, "refusal")
        r2 = b.round(25.5, b.low())
        b.link(n1, "responds_to", r1)
        b.link(p, "plans_for", r1)
        b.link(rf, "recurs", r1)
        b.link(r2, "recurs", rf)
        return b.scenario("H", "Day signal, evening plan, night refusal, morning signal", split,
                          S.PERSISTENT_SIGNAL, b.at(26))

    def refusal_plan(b, split):
        b.round(2, b.ok())
        b.note(8.5, "refusal")
        return b.scenario("P", "Refusal, no response after it", split, S.NEW_SIGNAL, b.at(26))

    def trap_offered_amount(b, split):
        r1 = b.round(6, b.low())
        n = b.note(6.5, "offered_amount", ml=int(b.ok()))
        b.link(n, "responds_to", r1)
        return b.scenario("K1", "Trap: an amount offered is not an amount drunk", split, S.UNVERIFIED, b.at(26))

    def trap_no_improvement(b, split):
        r1 = b.round(2, b.low())
        n = b.note(2.5, "response")
        b.note(6, "no_improvement")
        b.link(n, "responds_to", r1)
        return b.scenario("K2", "Trap: 'no improvement' after a response", split, S.PERSISTENT_SIGNAL, b.at(26))

    def trap_not_well(b, split):
        r1 = b.round(2, b.low())
        n = b.note(2.5, "response")
        b.note(6, "not_well")
        b.link(n, "responds_to", r1)
        return b.scenario("K3", "Trap: 'not drinking well' after a response", split, S.PERSISTENT_SIGNAL, b.at(26))

    def trap_plan_only(b, split):
        r1 = b.round(6, b.low())
        p = b.note(6.5, "plan_only_response")
        b.link(p, "plans_for", r1)
        return b.scenario("K4", "Trap: a plan is the only 'response'", split, S.NEW_SIGNAL, b.at(26))

    def negative_positive(b, split):
        b.round(2, b.ok())
        b.note(5, "positive")
        b.round(6, b.ok())
        return b.scenario("N1", "No concern, positive notes", split, None, b.at(26))

    def negative_roommate(b, split):
        b.round(2, b.ok())
        b.note(8, "roommate")
        b.note(16, "neutral")
        b.round(10, b.ok())
        return b.scenario("N2", "No concern, a note about someone else", split, None, b.at(26))

    def negative_plan(b, split):
        b.round(2, b.ok())
        b.note(9, "plan")
        b.round(10, b.ok())
        return b.scenario("N3", "No concern, a plan with no signal", split, None, b.at(26))

    def mobility_recovers(b, split):
        m1 = b.check(2, 1)
        n = b.note(3, "mob_response")
        b.check(8, 0)
        b.link(n, "responds_to", m1)
        return b.scenario("M1", "Mobility change, response, back to baseline", split, S.OUTCOME_VERIFIED, b.at(26))

    def mobility_persists(b, split):
        n0 = b.note(12, "mob_worse")
        n1 = b.note(12.6, "mob_response")
        m2 = b.check(25, 1)
        b.link(n1, "responds_to", n0)
        b.link(m2, "recurs", n0)
        return b.scenario("M2", "Mobility change in a note, still below baseline next day", split,
                          S.PERSISTENT_SIGNAL, b.at(26))

    def mobility_no_baseline(b, split):
        b.note(24.5, "mob_worse")
        return b.scenario("M3", "Mobility change, no documented baseline", split, S.AMBIGUOUS, b.at(26),
                          baseline=False)

    return [persistent, missing_outcome, success, delayed, ambiguous, duplicate, contradiction, cross_shift,
            refusal_plan, trap_offered_amount, trap_no_improvement, trap_not_well, trap_plan_only, negative_positive,
            negative_roommate, negative_plan, mobility_recovers, mobility_persists, mobility_no_baseline]


def generate(split: str, variants: int = 2, seed: int | None = None) -> list[Scenario]:
    bank = DEV if split == "dev" else HELD_OUT
    rng = random.Random(seed if seed is not None else (101 if split == "dev" else 202))
    out = []
    n = 0
    for builder in _family_builders():
        for _ in range(variants):
            n += 1
            out.append(builder(_Build(f"{n:03d}", random.Random(rng.random()), bank), split))
    return out


def all_scenarios() -> list[Scenario]:
    return generate("dev") + generate("held_out")
