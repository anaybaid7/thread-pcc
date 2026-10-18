# THREAD · 3-minute demo

**One line:** early signs aren’t missed, they’re dropped between people. THREAD carries a change from the PSW who
notices it to a recorded outcome, across the shift change.

## Workflow 1 · Spot it (PSW, 40 s)
1. **Spot it** → *Evelyn Carter*. Each row is *her* usual: “walks to every meal with her rollator”.
2. Mobility → **Different** → *Stayed in bed or room*. Eating → *Ate about a quarter*. Mood → *Quieter than usual*. Thinking → **Usual**. Type her words: *“I’ll stay put a bit, dear.”*
3. **Send to Priya.** Say: *“Drinking and pain weren’t checked, so they go as **not known**, not as fine.”*

## Workflow 2 · Size it up (charge nurse, 80 s)
1. **Size it up.** Board, top to bottom: Harold *recheck overdue*, Evelyn and Ruth *not yet seen*, Arthur *offered, nothing recorded*. Say: *“Ordered by reasons you can check. No risk score.”*
2. Open **Evelyn**: usual vs now, her quote, *Not known yet* on pain.
3. Check **Temperature 37.6** → “above *her* usual 36.2 to 36.8”. **Fluids 250** → “about 63% of her usual by now”.
4. Point at **Close: back to usual** (disabled): *“You can’t close it because someone did something. Only an outcome closes it.”*
5. **Escalate to Dr. Osei** → **Draft the SBAR** (built only from the record; Gemini or template) → **Escalate**.

## Workflow 3 · Carry it forward (shift change, 60 s)
1. **Carry it forward** → **Move the clock to 15:00**.
2. Read the top: Arthur, *fluids offered 3 times, no amount recorded*. Say: *“An offer is an attempt, not an outcome.”* Evelyn: *recheck overdue*.
3. **Take it on** for each item until *nothing left unowned*.

## If asked
- **Why not AI prediction?** The bottleneck is the hand-off, not the detection. INTERACT’s randomized trial (85 homes) found that giving staff the tools didn’t reduce hospitalizations; uptake did. So THREAD makes the follow-through the product.
- **Why the resident’s own ranges?** A Quebec study found nurses detected delirium in 13% of residents who had it. Detection depends on knowing the person.
- **Where’s the data?** PostgreSQL on Vultr. An append-only command log per ward, replayed, so every screen is reproducible.
