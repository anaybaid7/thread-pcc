# THREAD: pitch kit

## One sentence

THREAD reconstructs a resident's developing concern across care notes and measurements, connects it to what staff
documented, and surfaces the concerns whose resolution the records still don't establish, with every claim cited.

## Why this, for "Catch It Early"

| Judging criterion | What we show |
|---|---|
| **Usefulness** | The queue answers "who do I check first, and why" for the morning huddle. The handover says what the incoming shift would otherwise lose in the notes. |
| **Clarity** | Every state has a plain label and a glyph. Every explanation sentence cites the evidence it rests on; hover a citation and the card lights up. |
| **Creativity** | We don't predict risk. We follow a concern across shifts, separate a documented action from a verified outcome, and draw missing evidence as a frayed thread instead of hiding it. Replay shows what each handover could have known. |
| **Execution** | Live demo, 100+ tests, a public preview, WCAG 2.1 AA on every screen. |
| **Use of AI** | A clinical-NLP reader (ConText: negation, plans, experiencer, temporality) turns messy notes into events, plus an optional language-model reader held to verbatim-quote checks. Measured against a rule-only and a keyword baseline on held-out notes. |

## 90-second demo

Before you start: `make reset && make dev`, open http://localhost:3000, browser zoom 110%.
Backup with no network or laptop trouble: https://anaybaid7.github.io/thread-pcc/ (same screens, read-only).

| Time | Do | Say |
|---|---|---|
| 0–15 s | Needs review page | "Care teams already have observations, notes and alerts. What gets lost is the thread between them across shifts. It's Tuesday 09:00. THREAD ranks seven residents by *why* they need a second look, not by a risk score." |
| 15–35 s | Open **Rosa Marchetti** | "Monday 09:10, a low fluid round. A PSW offered her iced tea: THREAD calls that a documented response, not an outcome, because an offer isn't a drink. Then nothing is measured for 22 hours. That red stretch is an evidence gap, explicitly not proof care was missed. The evening plan was never confirmed, the night PSW's refusal note links it to this morning's low round, across four shifts." |
| 35–55 s | Click **Mon 23:00 handover** in Replay, then back to now | "Replay shows what each shift could have known: unverified by 23:00, persistent by morning." Then go to **Note lab**, click **Vague stays vague**. "This is where the AI earns its place. A keyword matcher reads 'didn't do well with drinks' as *well*: target met. THREAD reads it as low intake with no amount, and asks for a measurement instead of inventing one." |
| 55–75 s | **Shift handover** | "The handover brief is drafted only from these threads. Every sentence is cited and validated; the next step is a verification in Rosa's own terms: her blue two-handled cup, approach from her right." |
| 75–90 s | **Evaluation**, held-out | "76 labelled scenarios, held-out phrasings we never tuned on. THREAD caught every concern that needed review; the keyword reader wrongly closed eight. We list every error we still make. THREAD surfaces unresolved concerns. It doesn't diagnose or replace clinical judgement." |

Optional live moment (if time): on Rosa's thread, enter 260 in *What Rosa took at the bedside* and press **Verify
current status**. The thread turns *Outcome verified* and the audit log records it. Or in the Note lab, pick **The note
that closes Rosa's thread** and press **Add to Rosa's record**.

## Hard questions

**"Doesn't PointClickCare already do this?"**
PointClickCare offers early change detection, clinical guidance and change-in-condition workflows (eINTERACT, Nursing
Advantage). We're not claiming those don't exist. We're prototyping one specific interaction: reconstructing an
evidence-linked, cross-shift thread from measurements and free-text notes, and explicitly separating a documented
intervention from a verified outcome. Whether that adds value beyond the existing workflow is something we'd need to
validate with users.

**"Isn't this just a rules engine?"**
The state rules are deliberately deterministic, so decisions are explainable and testable. The AI does what thresholds
can't: read notes. Offered vs drank, planned vs done, negation, hedges, relayed history, someone else's roommate. The
evaluation compares the same state machine with and without note understanding: measurements alone catch 75% of the
held-out concerns; with THREAD's reader, all of them.

**"Why not just use an LLM for everything?"**
Because a model that writes a plausible but unsupported clinical explanation is worse than no tool. In THREAD the
model may only propose events, each must quote the note verbatim or it is rejected, and amounts are judged by the same
care-plan rules. Explanations pass a validator: no uncited sentence, no number that isn't in the evidence, no
diagnostic or blaming words.

**"How is this safe?"**
Synthetic data only. No diagnosis, no prediction, no treatment advice. Missing documentation is shown as a gap, never
as a failure. "Mark reviewed" can't resolve a concern. Ambiguous evidence stays unlinked for a person.

**"What evidence do you have that it prevents emergencies?"**
None, and we don't claim it. Reviews of deterioration tools in long-term care find better staff confidence and
communication but little robust evidence on resident outcomes. Our evaluation measures something narrower: can we
reconstruct the documented concern, flag unresolved cases, and avoid unsupported claims? Outcomes would need a real study.

**"Why hydration?"**
It's a concrete signal with clear measurements and messy notes, which is what the engine needs to prove itself.
Hydration products already track fluids; we're not rebuilding them. Mobility runs on the same engine to show the method
generalises.

**"How does it handle late documentation?"**
Every event keeps when it happened and when it was entered. Tom's lunch note was entered at 18:20 for 11:30: replay
shows the 15:00 handover saw an unanswered signal, and the 23:00 handover saw it verified.

## Limitations we state up front

- Synthetic data, written by us. The held-out split reduces, but doesn't remove, the bias of writing both the notes and
  the reader.
- Known misreadings on held-out notes: "pls", "need to", "recheck", and "would not drink" after a refusal.
- One drink is compared with a per-round target, which can open a short spurious thread.
- The resolution window is a demonstration rule, not clinical guidance.
- No authentication, roles or real integrations: this is a prototype.
- The language-model reader is optional and wasn't part of the reported numbers.
