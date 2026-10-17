"""Facility time: shifts and the demo clock.

Shifts follow a common Ontario long-term-care pattern: day 07:00-15:00, evening 15:00-23:00, night 23:00-07:00.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta

from .model import Shift

DEMO_NOW = datetime(2026, 10, 20, 9, 0)
"""Tuesday 09:00: the morning huddle the demo opens on."""

HANDOVERS = [
    datetime(2026, 10, 19, 15, 0),
    datetime(2026, 10, 19, 23, 0),
    datetime(2026, 10, 20, 7, 0),
    DEMO_NOW,
]
"""Points the as-of replay steps through: each shift change, then now."""

DAY_START, EVENING_START, NIGHT_START = time(7), time(15), time(23)


def shift_of(t: datetime) -> Shift:
    if DAY_START <= t.time() < EVENING_START:
        return "day"
    if EVENING_START <= t.time() < NIGHT_START:
        return "evening"
    return "night"


def shift_start(t: datetime) -> datetime:
    """Start of the shift instance containing t. A night shift belongs to the evening it starts on."""
    s = shift_of(t)
    if s == "day":
        return datetime.combine(t.date(), DAY_START)
    if s == "evening":
        return datetime.combine(t.date(), EVENING_START)
    day = t.date() if t.time() >= NIGHT_START else t.date() - timedelta(days=1)
    return datetime.combine(day, NIGHT_START)


def shift_label(t: datetime) -> str:
    """Human label for a shift instance, e.g. 'Mon day', 'Mon night' (which runs into Tuesday morning)."""
    start = shift_start(t)
    return f"{start:%a} {shift_of(t)}"


def handover_label(t: datetime) -> str:
    if t == DEMO_NOW:
        return f"{t:%a %H:%M} (now)"
    return f"{t:%a %H:%M} handover"
