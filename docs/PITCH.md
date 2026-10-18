# THREAD · 2-minute pitch video

**One line:** early signs of decline aren't missed, they're dropped between people. THREAD carries each change from the
PSW who notices it to a recorded outcome, across the shift change.

## Record it (hands-free)

1. `make reset && make dev`, then open Chrome at **http://localhost:3000**, window about 1440×900, bookmarks bar hidden.
   The header should read **Saved · local DB · Gemini on**.
2. Do one practice run (**Play the demo**) so Gemini is warm. It resets the ward itself each time.
3. Start a screen recording of the window (**Cmd+Shift+5 → Record Selected Portion**), then press **Play the demo**
   (or open **http://localhost:3000/?demo**). It runs for about 1:55 and clicks every button itself, with a visible
   cursor and captions.
4. Record your voice-over separately and lay it over the video in iMovie or CapCut, or read it live while it plays.
   The captions are your cue cards; the lines below match them.
5. If a caption says *Template draft* instead of *AI-assisted draft*, Gemini was busy. Just record again.

## Script (spoken, about 250 words)

| Time | On screen | Say |
|---|---|---|
| 0:00 | **The relay.** Rows for Arthur, Ruth, Harold, Margaret. Red dots mark where each is held. | "In long-term care, early signs of decline are rarely missed by everyone. They're dropped between people. THREAD shows every concern as a relay, from the person who noticed it to an outcome." |
| 0:10 | Cursor on Ruth's row: *Waiting 65 min*. | "Right now Ruth's report has waited over an hour for a nurse. Harold's recheck is overdue. Arthur's drinks were offered three times and never measured." |
| 0:19 | **Spot it.** Maya's phone. Evelyn's rows each show *her* usual. Cursor marks three areas *Different*, Thinking *Usual*, types her words. | "Maya, a PSW, checks Evelyn against Evelyn's own usual. She stayed in bed, ate a quarter of breakfast, and is quieter than usual." |
| 0:35 | *2 not checked, sent as not known.* Cursor presses **Send to Priya**. Priya's board, on the right, updates. | "What Maya didn't check, drinking and pain, goes to the nurse as *not known*. Never as fine. One tap, and it's on the nurse's board." |
| 0:48 | **Size it up.** Priya's board, ordered by reason. Evelyn opens: usual vs now, her quote. | "Priya's board is ordered by reasons she can check. There's no risk score." |
| 0:53 | Temperature **37.6** typed: *above her usual 36.2 to 36.8*. | "37.6 is normal for most people. It's above Evelyn's usual." |
| 1:02 | Cursor on the greyed-out **Close** and *Needs a recorded outcome*. | "She can't close it. Only a recorded outcome closes a concern, not a task done." |
| 1:10 | **Escalate to Dr. Osei → Draft the SBAR.** Gemini's draft appears, labelled *AI-assisted*. | "Gemini drafts the SBAR from the recorded facts only. If it adds a number or a diagnosis that isn't in the record, THREAD throws the draft out. Priya reads it and escalates." |
| 1:22 | **Carry it forward.** The clock moves to 15:00. The handover sheet fills. | "Three o'clock, shift change. The evening nurse gets every open item. Arthur: offered three times, never measured. An offer is an attempt, not an outcome." |
| 1:31 | **Take it on**, row by row, until *nothing left unowned*. | "Each one is taken on by name. Nothing goes unowned." |
| 1:42 | **Back to the relay.** Every row now shows *Taken on by Daniel*. | "Evelyn's recheck is now Daniel's. What's still open is visible, not lost. Every step is stored and can be replayed. THREAD: catch it early, then don't drop it." |

## If asked
- **Why not AI prediction?** Detection isn't where it breaks down; follow-through is. INTERACT's randomized trial (85 homes) found that giving staff the tools didn't reduce hospitalizations; uptake did. So THREAD makes the follow-through the product.
- **Why the resident's own ranges?** A Quebec study found nurses detected delirium in 13% of residents who had it. Detection depends on knowing the person.
- **Is the AI safe?** It only rewrites recorded facts. Invented numbers and diagnosis or treatment language are rejected for a template, and the nurse edits before anything is sent.
- **Where's the data?** PostgreSQL (built for Vultr Managed PostgreSQL). An append-only log of every action per ward, replayed, so every screen is reproducible.
- **Is it validated?** No. A prototype with fictional residents. Next: review with LTC nurses and PSWs, then a pilot measuring time from noticing a change to a nurse acting on it.
