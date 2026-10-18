# THREAD · pitch kit

## One line

**THREAD is a playable shift that teaches care staff to tell an off day from something more:** judge change against the
resident's own baseline, keep facts apart from guesses and gaps, and communicate it clearly. Then see exactly why each
decision was or wasn't a thoughtful one.

## The problem (15 seconds)

In long-term care, the people who notice change first are often support workers: a resident eats less, stays in bed,
skips the music group. Each observation alone can be nothing. What matters is comparison with *her* usual, the pattern
across shifts, and whether the change reaches someone who can assess it. That is a judgment skill, and it is hard to
practise on real residents.

## Demo script (90 seconds)

1. **Home (5 s).** "Off day, or something more? Evelyn eats a quarter of her breakfast. On its own, that could be
   nothing." Click *Start with Evelyn*.
2. **Baseline (10 s).** Point at *Her usual* and the chart: "Last week, around her usual on every line. Everything is
   judged against this."
3. **Reveal (15 s).** Press *Next event* a few times. "One event per click, nothing happens in the background. Observed,
   documented, and here, dashed: *not known*. No fluids, pain or temperature recorded."
4. **Decision (20 s).** "Which parts changed? Mobility, intake, engagement, not sleep: the night note says settled. Is
   'she's just tired after her daughter's visit' an observation? No, an assumption. 'She's had enough to drink'?
   Unknown." Choose *Tell Priya now*. Show the 40/40 feedback: "Judged on what you knew at 11:00."
5. **Consequence (10 s).** Next events: Tuesday, in bed again, now needs help to walk. Second decision.
6. **Handover (15 s).** "Gemini drafts an SBAR from only the facts I've seen. Every section cites them, and the server
   rejects any draft with an invented number or a diagnosis." Edit a line, submit.
7. **Debrief and replay (15 s).** Score ring, four criteria, *If you'd chosen differently*. Click *Replay: the other
   version of the day*: "Here Evelyn recovers by lunch. Make the same 11:00 choice and you get the same score. Hindsight
   never changes it."

## Judging criteria

| Criterion | Where it shows |
|---|---|
| **Usefulness** | Practises the exact moment the "Catch It Early" challenge is about: noticing change relative to a baseline and communicating it. Short enough for a huddle or onboarding. |
| **Clarity** | One resident, one shift, one button to move forward. Baseline chart, a four-type timeline, a three-step decision. Every point in the score is explained. |
| **Creativity** | Two versions of the same day, scored identically at the decision point: it teaches that outcomes don't grade decisions. "Offered isn't consumed" and "unknown isn't fine" are built into the mechanics, not added as tips. |
| **Execution** | Deterministic engine shared by server and browser, a PostgreSQL schema with immutable attempts and replay, Vultr-ready TLS, a 503 path that never claims a save, tests, CI against real PostgreSQL, WCAG 2.1 AA, phone layout. |
| **Use of AI** | Gemini does one bounded job: it turns facts the player has seen into an editable SBAR draft. It is grounded by schema and server validation, has a deterministic fallback, and never decides branches or scores. |

## Judge Q&A

**Why not let the AI run the scenario?** Because the lesson depends on fairness and repeatability: the same choice
must lead to the same place and the same score. Events, branches and scores are code and data that a clinical
educator can review. The model only helps with phrasing.

**What stops Gemini making things up?** Its output schema only allows fact ids that were supplied. The server then
rejects any draft that cites an unknown as known, contains a number that isn't in the facts, or names a diagnosis,
treatment or reassurance. Rejected drafts fall back to a template, with the reason shown. Drafts are labelled
AI-assisted and must be edited.

**Is the score validated?** No. It is a transparent prototype rubric with every rule visible. The research we cite
informed the format (prebrief, practice, debrief; SBAR; timely communication). It does not validate THREAD.

**Why Vultr PostgreSQL?** Attempts are training records: what was revealed, what was decided, with what evidence,
and how it scored. They must be durable and inspectable. Replays are new rows, and completed attempts never change.

**What's next?** Review of the scenarios by long-term-care educators, a scenario authoring format they can edit,
facilitator views of anonymised attempt patterns (for example, which unknowns people most often treat as facts), and a
small pilot evaluation.

## Honest limitations

- Synthetic content only. Illustrative indices, not measurements.
- Not reviewed by clinicians yet. Needs expert review and formal evaluation before use with staff.
- Not tested against a live Vultr cluster or a live Gemini key during the build. Both are configured through
  environment variables, with documented setup and explicit fallbacks.
