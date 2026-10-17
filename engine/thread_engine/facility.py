"""Valleyview Commons: a fictional long-term-care home, two wings, Monday 07:00 to Tuesday 09:00.

Every resident, staff member and record here is invented. Notes are written the way progress notes are written in
Ontario long-term care (PSW / RPN / RN, abbreviations, late entries), because a demo with tidy notes proves nothing.

Each resident exercises one scenario from the strategy (A-H for hydration, plus mobility and residents with no
concern), so the queue looks like a real morning rather than twelve copies of the same alert.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .model import CarePlanRule, Resident, Role, SourceRecord, SourceType

FACILITY = "Valleyview Commons"
WINGS = ["Maple", "Birch"]
_DAYS = {"Mon": datetime(2026, 10, 19), "Tue": datetime(2026, 10, 20)}
PLAN_START = datetime(2026, 9, 1)

# Staff on each shift (fictional). Names appear on notes exactly as a charting system would print them.
AMARA, JOEL, DANIEL = ("PSW Amara K.", "PSW"), ("PSW Joel T.", "PSW"), ("RPN Daniel O.", "RPN")
LINA, KWAME, SOFIA = ("PSW Lina M.", "PSW"), ("PSW Kwame A.", "PSW"), ("RPN Sofia R.", "RPN")
TERESA = ("PSW Teresa V.", "PSW")
NADIA = ("Physio Nadia B.", "Physio")


def at(when: str) -> datetime:
    """'Mon 09:10' -> datetime."""
    day, hm = when.split()
    h, m = hm.split(":")
    return _DAYS[day].replace(hour=int(h), minute=int(m))


@dataclass
class _Builder:
    records: list[SourceRecord] = field(default_factory=list)
    counters: dict[str, int] = field(default_factory=lambda: {"F": 1000, "M": 3000, "N": 2000})

    def _id(self, prefix: str) -> str:
        self.counters[prefix] += 1
        return f"{prefix}-{self.counters[prefix]}"

    def _add(self, prefix: str, rid: str, kind: SourceType, when: str, who: tuple[str, Role], lag: int,
             recorded: str | None, **kw) -> None:
        t = at(when)
        self.records.append(SourceRecord(
            source_id=self._id(prefix), resident_id=rid, source_type=kind, event_time=t,
            recorded_at=at(recorded) if recorded else t + timedelta(minutes=lag), author=who[0], author_role=who[1],
            **kw,
        ))

    def fluid(self, rid: str, when: str, ml: float, who: tuple[str, Role], lag: int = 4, recorded: str | None = None,
              batch: str | None = "POC-1") -> None:
        """A fluid round: mL taken since the previous round, entered at the point of care."""
        self._add("F", rid, "fluid_round", when, who, lag, recorded, value=ml, unit="mL", import_batch=batch)

    def mobility(self, rid: str, when: str, assist: int, who: tuple[str, Role], lag: int = 5) -> None:
        """A mobility check: number of staff needed to transfer and walk."""
        self._add("M", rid, "mobility_check", when, who, lag, None, value=assist, unit="staff assist")

    def note(self, rid: str, when: str, who: tuple[str, Role], text: str, lag: int = 12,
             recorded: str | None = None) -> None:
        """A progress note. `when` is the time the note is documented for; `recorded` overrides entry time."""
        self._add("N", rid, "progress_note", when, who, lag, recorded, text=text)


def _resident(rid, name, preferred, room, wing, age, profile, preferences, communication) -> Resident:
    return Resident(resident_id=rid, display_name=name, preferred_name=preferred, room=room, wing=wing, age=age,
                    synthetic_profile=profile, preferences=preferences, communication=communication)


def _fluids(rid: str, ml: int, extra: str = "") -> CarePlanRule:
    return CarePlanRule(
        rule_id=f"{rid}-hyd", resident_id=rid, domain="hydration", metric="fluid_round_ml", operator=">=",
        threshold=ml, unit="mL", valid_from=PLAN_START,
        description=f"Offer and record fluids at each round; aim for at least {ml} mL per round.{extra}",
    )


def _mobility(rid: str, baseline: int | None, desc: str) -> CarePlanRule:
    return CarePlanRule(
        rule_id=f"{rid}-mob", resident_id=rid, domain="mobility", metric="assist_level", operator="<=",
        threshold=baseline if baseline is not None else 0, unit="staff assist", valid_from=PLAN_START,
        description=desc, resolution_window_hours=12.0, baseline_documented=baseline is not None,
    )


RESIDENTS: list[Resident] = [
    _resident("R214", "Rosa Marchetti", "Rosa", "214", "Maple", 87,
              "Moderate dementia. Loves the 10 o'clock music group; forgets her cup once it's on the tray.",
              ["Iced tea with lemon, in her blue two-handled cup", "Sits by the lounge window in the mornings"],
              ["Hard of hearing on the left: approach from her right", "Responds well to 'Buongiorno, Rosa'"]),
    _resident("R216", "Walter Huang", "Walter", "216", "Maple", 91,
              "Retired machinist. Drinks better in the afternoon; naps after lunch.",
              ["Black tea, strong, with milk", "Cup within reach on his left (right hand weak)"],
              ["Wears hearing aids: check they are in"]),
    _resident("R218", "Evelyn Brooks", "Evie", "218", "Maple", 79,
              "Former schoolteacher, independent, does the crossword daily. Getting over a cold.",
              ["Warm water with honey when her throat is sore"], []),
    _resident("R220", "Thomas Achterberg", "Tom", "220", "Maple", 84,
              "Ex-dairy farmer, up at 05:30. Eats lunch in his room most days.",
              ["Coffee, decaf after noon", "Large mug rather than small cups"], ["Speaks slowly; give him time"]),
    _resident("R222", "Dorothy Singh", "Dot", "222", "Maple", 88,
              "Loves old Bollywood films. Her daughter visits most evenings.",
              ["Mildly thick fluids per SLP", "Mango lassi (thickened) is a favourite"],
              ["Short sentences, one question at a time"]),
    _resident("R224", "Harold Mensah", "Harold", "224", "Maple", 82,
              "Retired accountant; keeps an eye on the clock and the news.", ["Ginger ale", "Water with no ice"], []),
    _resident("R226", "Agnes Kowalski", "Agnes", "226", "Maple", 90,
              "Sings in the Wednesday choir. Tends to say she's fine.", ["Cranberry juice, half water"],
              ["Prefers to be asked privately, not in the dining room"]),
    _resident("R228", "Joseph Tremblay", "Joe", "228", "Maple", 86,
              "Franco-Ontarian, former hockey coach. Switches to French when tired.",
              ["Water in a bottle with a sport cap", "Apple juice at bedtime"],
              ["Answer in French if he speaks French"]),
    _resident("R310", "Frank Delorme", "Frank", "310", "Birch", 80,
              "Moved in three weeks ago after a hospital stay. Admission mobility assessment not yet in the plan.",
              ["Morning walk to the dining room with his walker"], []),
    _resident("R312", "Lillian Park", "Lil", "312", "Birch", 83,
              "Retired florist; looks after the courtyard planters.", ["Rollator, independent"],
              ["Wears glasses for distance"]),
    _resident("R314", "George Whitfield", "George", "314", "Birch", 89,
              "Retired pilot. New walker last week.", ["Walker set to his height"], []),
    _resident("R316", "Mabel Fontaine", "Mabel", "316", "Birch", 94,
              "Oldest resident on the floor; never misses the music program.", ["Orange juice"], []),
    _resident("R318", "Samuel Okonkwo", "Sam", "318", "Birch", 77,
              "Former choir director; organises movie night.", ["Sparkling water"], []),
    _resident("R320", "Irene Blackwood", "Irene", "320", "Birch", 92,
              "Quiet mornings; brightens up after breakfast.", ["Weak tea, lukewarm"], ["Low voice, face her"]),
]


CARE_PLAN: list[CarePlanRule] = [
    _fluids("R214", 250, " Cue verbally and hand her the cup; she will not reach for it."),
    _fluids("R216", 200),
    _fluids("R218", 250),
    _fluids("R220", 250),
    _fluids("R222", 200, " Mildly thick fluids only."),
    _fluids("R224", 250),
    _fluids("R226", 250),
    _fluids("R228", 250),
    _fluids("R312", 250),
    _fluids("R316", 200),
    _fluids("R318", 250),
    _fluids("R320", 200),
    _mobility("R214", 0, "Walks short distances with her walker, independent."),
    _mobility("R310", None, "Walker for all walking. Baseline distance and assist level: admission assessment due."),
    _mobility("R312", 0, "Independent with rollator for transfers and walking."),
    _mobility("R314", 0, "Independent with walker once set up."),
]


def _records() -> list[SourceRecord]:
    b = _Builder()

    # R214 Rosa: the hero thread (scenarios A + H). Low round, a documented response, no follow-up round all
    # afternoon, an evening plan nobody confirms, a night refusal, and another low round on Tuesday morning.
    b.fluid("R214", "Mon 09:10", 120, AMARA)
    b.note("R214", "Mon 10:05", AMARA, "Offered preferred iced tea in her blue cup; assistance provided.")
    b.note("R214", "Mon 16:40", SOFIA,
           "Day shift reports res had low fluids this AM. Will reassess fluid intake after supper and "
           "encourage fluids at HS med pass.")
    b.note("R214", "Mon 22:30", LINA, "Res settled for the night, pleasant and calm. No concerns voiced.")
    b.note("R214", "Tue 03:10", TERESA, "Res awake x2 overnight, toileted. Declined water when offered.")
    b.fluid("R214", "Tue 08:45", 100, AMARA)

    # R216 Walter: scenario B, missing outcome. Response documented, then no measurement at all.
    b.fluid("R216", "Mon 09:05", 230, AMARA)
    b.fluid("R216", "Mon 13:05", 90, AMARA)
    b.note("R216", "Mon 13:30", AMARA,
           "Encouraged fluids. Set up strong tea w/ milk the way he likes it, within reach on L side.")
    b.note("R216", "Tue 05:50", TERESA, "Slept well, no concerns overnight.")

    # R218 Evelyn: scenario C, successful follow-up.
    b.fluid("R218", "Mon 09:00", 150, AMARA)
    b.note("R218", "Mon 09:40", DANIEL, "Res c/o sore throat. Offered warm water with honey, res drank it slowly.")
    b.fluid("R218", "Mon 13:05", 320, AMARA)
    b.fluid("R218", "Mon 17:00", 280, LINA)

    # R220 Thomas: scenario D, delayed documentation. The lunch note is entered after the 15:00 handover.
    b.fluid("R220", "Mon 09:05", 140, AMARA)
    b.note("R220", "Mon 11:30", JOEL,
           "Late entry for 11:30: assisted res with a full mug of decaf coffee and water at lunch, "
           "drank approx 300 mL.", recorded="Mon 18:20")
    b.fluid("R220", "Mon 17:05", 260, LINA)

    # R222 Dorothy: scenario E, ambiguous note. Measured rounds are fine; the evening note is vague.
    b.fluid("R222", "Mon 09:00", 240, AMARA)
    b.fluid("R222", "Mon 13:00", 210, AMARA)
    b.note("R222", "Mon 19:15", KWAME, "Didn't do well with drinks today. Daughter visited after supper.")

    # R224 Harold: scenario F, the 13:00 round arrives twice from a repeated interface import.
    b.fluid("R224", "Mon 09:00", 260, AMARA)
    b.fluid("R224", "Mon 13:00", 130, AMARA, batch="POC-1")
    b.fluid("R224", "Mon 13:00", 130, AMARA, recorded="Mon 13:40", batch="POC-1-retry")
    b.note("R224", "Mon 13:20", AMARA, "Offered ginger ale, no ice. Res drank most of the can.")
    b.fluid("R224", "Mon 17:00", 300, LINA)

    # R226 Agnes: scenario G, contradictory evidence. A note says "much improved" right after a low round.
    b.fluid("R226", "Mon 09:00", 260, AMARA)
    b.fluid("R226", "Mon 13:00", 110, AMARA)
    b.note("R226", "Mon 14:10", AMARA, "Encouraged cranberry juice x2.")
    b.fluid("R226", "Mon 17:10", 120, LINA)
    b.note("R226", "Mon 17:45", SOFIA, "Fluid intake much improved this evening per PSW.")

    # R228 Joseph: refusal with a plan that is never confirmed.
    b.fluid("R228", "Mon 09:00", 270, AMARA)
    b.note("R228", "Mon 15:40", LINA,
           "Res refused fluids at afternoon round, stated \"pas soif\". Will offer again after supper.")

    # R310 Frank: mobility change described in a note, baseline not established (strategy's Resident B).
    b.note("R310", "Tue 07:40", JOEL,
           "Res walked to dining room with walker but only made it halfway, needed to sit and rest. "
           "Seems more tired than usual?")

    # R312 Lillian: mobility change, assessed, still below baseline next morning.
    b.mobility("R312", "Mon 10:00", 0, JOEL)
    b.fluid("R312", "Mon 13:00", 260, JOEL)
    b.note("R312", "Mon 19:30", KWAME, "Res unsteady on feet standing up from recliner, needed 1 assist to transfer.")
    b.note("R312", "Mon 20:10", SOFIA,
           "Assessed res after PSW report. No injury, no c/o pain. Bed lowered, call bell within reach, "
           "reminded to ring before getting up.")
    b.mobility("R312", "Tue 08:30", 1, JOEL)

    # R314 George: mobility change that recovers after a physio adjustment.
    b.mobility("R314", "Mon 09:30", 1, JOEL)
    b.note("R314", "Mon 11:00", NADIA, "Physio reviewed gait. Walker height adjusted up 2 notches.")
    b.mobility("R314", "Mon 16:00", 0, KWAME)

    # R316 Mabel: no concern of her own, but one of her notes is about her roommate (stays unlinked).
    b.fluid("R316", "Mon 09:00", 230, JOEL)
    b.fluid("R316", "Mon 13:00", 250, JOEL)
    b.note("R316", "Mon 16:20", KWAME, "Enjoyed the music program, drank well. Roommate refused her afternoon "
                                       "drink, reported to RPN.")
    b.fluid("R316", "Mon 17:00", 220, KWAME)

    # R318 Samuel: a plan with no signal must not open a thread.
    b.fluid("R318", "Mon 09:00", 300, JOEL)
    b.fluid("R318", "Mon 13:00", 280, JOEL)
    b.note("R318", "Mon 18:30", KWAME, "Will encourage fluids during movie night.")
    b.fluid("R318", "Mon 17:00", 260, KWAME)

    # R320 Irene: Tuesday morning low round with a response; still inside the window at 09:00.
    b.fluid("R320", "Mon 09:00", 210, JOEL)
    b.fluid("R320", "Mon 13:00", 230, JOEL)
    b.fluid("R320", "Tue 08:00", 90, JOEL)
    b.note("R320", "Tue 08:20", JOEL, "Offered weak tea, lukewarm, the way she likes it; stayed with her while "
                                      "she drank.")

    return sorted(b.records, key=lambda r: (r.recorded_at, r.source_id))


RECORDS: list[SourceRecord] = _records()


def resident(rid: str) -> Resident:
    return next(r for r in RESIDENTS if r.resident_id == rid)


def rules_for(rid: str, rules: list[CarePlanRule] | None = None) -> list[CarePlanRule]:
    return [r for r in (CARE_PLAN if rules is None else rules) if r.resident_id == rid]
