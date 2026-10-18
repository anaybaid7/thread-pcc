# THREAD · Off Day or Something More?

**An interactive long-term-care training simulation.** Learn a resident's usual pattern, reveal what happens one event at
a time, decide with only what you know, hand over clearly, and see your reasoning debriefed. Then replay the other
version of the day.

Built for the PointClickCare **Catch It Early** challenge. Every resident, staff member and event is fictional. THREAD
is a hackathon prototype, not a clinical tool.

**Play the preview:** https://anaybaid7.github.io/thread-pcc/. This is practice mode: the same engine runs in your
browser and nothing is saved. Run it locally to save attempts in PostgreSQL and use Gemini handover drafts.

![Opening screen](docs/screenshots/home.png)

## The idea

Evelyn usually walks to breakfast with her rollator, eats most of it, and sings at the 10:30 music group. On Monday
she stays in bed, eats a quarter of her porridge on a tray and skips music. On its own, that could be nothing.

At 11:00 you decide what it means and what to do, using only the six events you have seen. Then the day continues
down one of two courses: the change **persists** into Tuesday and spreads to her walking, or it **resolves** by lunch.
Your 11:00 decision is worth exactly the same in both, because it is judged on what you knew at 11:00, never on how
the day turned out.

> One unusual observation can be ambiguous. Her own baseline, the pattern across time, and how clearly the change is
> communicated decide what a thoughtful next step looks like.

The loop: **learn the baseline → observe a change → inspect the evidence → decide → see what happens → debrief →
replay.**

| | |
|---|---|
| ![Shift timeline](docs/screenshots/timeline.png) | ![Deviation heatmap](docs/screenshots/heatmap.png) |
| **Shift timeline.** Swimlanes for each person across day, evening and night. Bars show who knew of the change; arrows are hand-offs, broken where nothing was passed on. Drag the cursor back to see what was known at any moment, or pick a decision to light up the entries it was scored on. | **Pattern against her usual.** A deviation heatmap by area and shift (also as lines, or as a 3D view). Illustrative index, 100 = usual. |
| ![A decision](docs/screenshots/decision.png) | ![Decision map](docs/screenshots/map.png) |
| **Decisions.** What changed, then a classification table (observed, assumption, unknown; keys 1 to 3), then the action. Feedback states the points and the reasoning. | **Debrief.** Score composition, decision quality against outcome (the same Monday decision under both endings), and a map of every choice and where it leads. |

### Scenarios

1. **Off Day or Something More?** Evelyn Carter. A first off day, then persistence, resolution, or missed context
   depending on the course and on whether anyone was told. *The main scenario.*
2. **Not Quite Herself.** Ruth Okafor. A change in orientation that is new since breakfast: recognise it and get it to
   the nurse promptly, without naming a cause.
3. **Offered Isn't Consumed.** Arthur Bell. Two days of "fluids offered" with no amounts, and a full cold cup. Tell an
   attempt apart from an outcome, and say what nobody knows.

## Scoring

A transparent, illustrative 100-point rubric. Every point comes from an explicit rule in
[`engine/src`](engine/src), and the debrief explains each one.

| Criterion | Points | Rule |
|---|---:|---|
| Recognising change from baseline | 30 | Points per changed area identified, minus points for areas the evidence doesn't support; the trend at the second decision |
| Communication and action | 30 | Each choice has fixed points and written feedback, judged on the evidence at the time |
| Facts, assumptions and unknowns | 25 | Points per statement correctly sorted as observed, assumption or unknown |
| Handover clarity | 15 | Five checks: situation tied to an observation, baseline in the background, two or more timed observations and no unknowns in the assessment, a clear request, unknowns listed. Diagnosis, treatment or false-reassurance language voids the section |

No points for naming a diagnosis, predicting a transfer, or reaching the most dramatic ending.

## How it's built

```
engine/   pure TypeScript: scenario data, deterministic engine, rubric, debrief, handover facts and validator
server/   Fastify API: PostgreSQL persistence, migrations and seed, Gemini drafting, health check
web/      Next.js app: three.js scenes, the simulation UI, saved mode via the API or practice mode in the browser
e2e/      Playwright: the whole game in Chromium, saved and practice mode, desktop and phone, with axe checks
```

- **Visualizations that answer questions.** The shift timeline shows who knew what and when, including hand-offs
  that never happened; its cursor replays what was known at any moment. The heatmap shows deviation from the
  resident's usual at a glance. The debrief plots decision quality against outcome and maps every alternative choice
  to its consequences. A three.js scene on the home page shows the idea itself: one Monday, two possible Tuesdays.

- **Deterministic engine.** Scenarios are data: baseline, ordered events, decision points, choices with points, branch
  conditions by course, expected reasoning. The engine reveals one event per step, records the event ids revealed at
  each decision as its evidence, and scores from the player's input and the decision point only. The same state and
  choice always produce the same branch. Pending decisions never send their answers to the browser.
- **PostgreSQL (Vultr Managed Databases).** Every command runs in one transaction: lock the attempt, check the
  revision the client saw, apply the engine, then write the new state, an append-only `attempt_events` log, the
  decision with its evidence, score lines, handover drafts and the debrief. Completed attempts are immutable. Replay
  creates a new attempt (`replay_of`) on the same scenario version. Seeded scenario versions are content-hashed and
  can't change without a version bump. If the database is unavailable the API returns **503 with the reason**, and the
  UI says nothing was saved and offers practice mode.
- **Gemini, only for the handover.** On the player's request, the server sends Gemini the resident's baseline and the
  revealed events. The request uses [structured output](https://ai.google.dev/gemini-api/docs/structured-output) with a
  JSON schema whose `fact_ids` are restricted to the supplied ids. The server then validates the draft: it must parse
  against the schema; unknowns can't support the situation, background or assessment; it may contain no number that
  isn't in the facts; and it may contain no diagnosis, treatment or reassurance language. Anything else falls back to a
  deterministic template and gives the reason: no key, a timeout, an HTTP error, invalid output, or a per-attempt or
  hourly budget reached. The model never touches events, branches or scores.

Schema: `scenarios`, `scenario_versions`, `resident_profiles`, `scenario_events`, `simulation_attempts`,
`attempt_events`, `player_decisions`, `decision_scores`, `handover_drafts`, `debrief_results`
([migration](server/migrations/001_init.sql)).

## Run it

Needs Node 22+. Nothing else: with no configuration, the API uses an embedded PostgreSQL (PGlite) in `.data/`, and
handover drafts use the template.

```bash
make setup   # npm install (all workspaces)
make dev     # API on :8000, app on http://localhost:3000
make test    # engine and server tests
make pages   # the static practice-mode build used for GitHub Pages
make e2e     # build both modes and play the game in Chromium (saved, practice, phone)
```

Other targets: `make migrate`, `make seed` (both also run automatically when the API starts), `make reset` (delete the
embedded database), `make typecheck`, `make lint`, `make build`. To use a local PostgreSQL server instead:
`docker compose up -d` and `DATABASE_URL=postgresql://thread:thread@localhost:5432/thread make dev`.

### Configuration

Copy [`.env.example`](.env.example) to `.env`. Never commit `.env`. All secrets stay on the server: the browser only
talks to `/api`.

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | *(empty: embedded PGlite)* | Any PostgreSQL URL, e.g. Vultr's |
| `DATABASE_CA_CERT` | | Path to (or PEM of) the cluster's CA certificate; enables `verify-full` |
| `DATABASE_SSL` | `require` for remote hosts | `disable`, `require` or `verify-full` |
| `GEMINI_API_KEY` | *(empty: template drafts)* | Server-side only |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Any Gemini model that supports structured output |
| `GEMINI_TIMEOUT_MS` | `12000` | |
| `GEMINI_MAX_DRAFTS_PER_ATTEMPT` | `3` | AI drafts per attempt before the template is used |
| `GEMINI_MAX_REQUESTS_PER_HOUR` | `60` | Per server process |
| `THREAD_API_ORIGIN` | `http://127.0.0.1:8000` | Where the web app proxies `/api`. Read when the web app is **built** (Next.js bakes rewrites in) |

### Vultr Managed PostgreSQL

1. In the Vultr console, deploy a PostgreSQL cluster (**Products → Databases**).
2. Under the cluster's trusted sources, allow the IP address of the machine that runs the THREAD API.
3. Open **Overview → Connection Details**, click **Copy PostgreSQL URL**, and set it as `DATABASE_URL`.
4. For certificate verification, click **Download Signed Certificate**, save it outside the repo, and set
   `DATABASE_CA_CERT` to its path. Without it, the connection is still encrypted (`require`).
5. Run `make migrate` (or just start the API), then open http://localhost:8000/api/health. It should report
   `"provider": "vultr"` and the schema version, and the app's header will say *Saved to Vultr PostgreSQL*.

Vultr's docs: [PostgreSQL overview](https://docs.vultr.com/product-overviews/postgresql?section=documentation) ·
[connection details](https://docs.vultr.com/products/storage/databases/postgresql/management/connection/connection-details).

### Gemini

Create a key in [Google AI Studio](https://aistudio.google.com/apikey), set `GEMINI_API_KEY`, and restart the API.
The handover screen then offers **Draft with Gemini**. Drafts are labelled AI-assisted and must be reviewed and edited.
Each draft is stored in `handover_drafts` with the facts supplied to the model and any validation failures.

### What has and hasn't been tested

- Tested in this repository:
  - Engine: determinism, branching, scoring on every course, evidence at decision time, unknowns never treated as
    facts.
  - API on embedded PostgreSQL: full attempts, replay isolation, stale revisions, completed-attempt immutability and
    the 503 path.
  - The node-postgres driver over the PostgreSQL wire protocol.
  - A real PostgreSQL 17 server in CI.
  - Gemini handling against stubbed responses: valid, invented vital sign, unknown presented as known, diagnosis,
    HTTP error, malformed JSON, timeout and budgets.
  - Every path through every scenario (each course, each choice, careful and careless answers) played by the engine.
  - Playwright in CI: the full game in saved mode against the real API, in practice mode against the static build,
    on a phone viewport, a refresh mid-game, replay isolation, and axe WCAG 2.1 AA on every screen.
- **Not yet tested:**
  - A live Vultr cluster: no credentials were available while building. The TLS options follow Vultr's connection
    details but haven't been exercised against a real cluster.
  - A live Gemini call: no API key was available. The request uses the documented `generateContent` structured-output
    fields. If the model rejects them, THREAD falls back to the template and shows why.

## Research and design rationale

The [rationale page](https://anaybaid7.github.io/thread-pcc/rationale/) lists the sources that shaped the design and
where each shows up. In short:

- Structured prebrief, practice and debrief
  ([systematic review, 2023](https://doi.org/10.1016/j.nedt.2023.105838)).
- Communication as a first-class skill, through SBAR
  ([PDSA SBAR training in nursing homes, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9981342/);
  [SBAR in long-term care, 2013](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932321/)).
- Timely, non-blaming communication of change
  ([AHRQ](https://www.ahrq.gov/patient-safety/settings/long-term-care/resource/facilities/ltc/mod2concl.html)).

These sources inform the design. They do not validate THREAD or its score.

## Limitations

- All content is synthetic. Chart values are illustrative indices, not clinical measurements or thresholds.
- The rubric and scenarios were written by the team and have not been reviewed by clinicians or educators. They need
  expert review and formal evaluation before any real-world use.
- THREAD does not diagnose, predict deterioration or hospitalisation, recommend treatment, or replace staff assessment
  or facility reporting procedures.

The pitch script and judge Q&A are in [docs/PITCH.md](docs/PITCH.md). Work is tracked as
[issues](https://github.com/anaybaid7/thread-pcc/issues?q=is%3Aissue) and
[milestones](https://github.com/anaybaid7/thread-pcc/milestones).
