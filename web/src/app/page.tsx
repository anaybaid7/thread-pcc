import { SCENARIOS } from '@thread/engine'
import Link from 'next/link'

function ForkVisual() {
  // Her usual band, a Monday dip, and two possible Tuesdays. Illustrative.
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline illustration with a text alternative
    <svg viewBox="0 0 420 200" className="h-auto w-full" role="img" aria-label="Illustration: a resident's usual pattern, a dip on Monday, and two possible Tuesdays: the change persists, or it resolves.">
      <rect x="20" y="40" width="380" height="44" rx="6" fill="var(--color-accent)" opacity="0.08" />
      <text x="28" y="34" fontSize="12" fill="var(--color-ink-3)">
        her usual
      </text>
      <path d="M24 62 C60 58, 90 66, 120 60 S180 58, 210 62" fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
      <path d="M210 62 C232 66, 238 128, 262 132" fill="none" stroke="var(--color-intake)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="262" cy="132" r="7" fill="var(--color-intake)" />
      <text x="232" y="160" fontSize="12.5" fontWeight="600" fill="var(--color-ink)">
        Monday 11:00
      </text>
      <text x="232" y="176" fontSize="12" fill="var(--color-ink-3)">
        off day, or more?
      </text>
      <path d="M268 128 C300 112, 320 62, 396 60" fill="none" stroke="var(--color-good)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
      <text x="330" y="52" fontSize="12" fontWeight="600" fill="var(--color-good)">
        resolves
      </text>
      <path d="M268 134 C310 142, 340 160, 396 168" fill="none" stroke="var(--color-poor)" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
      <text x="338" y="190" fontSize="12" fontWeight="600" fill="var(--color-poor)">
        persists
      </text>
    </svg>
  )
}

const LOOP = ['Learn her baseline', 'Observe a change', 'Inspect the evidence', 'Decide', 'See what happens', 'Debrief', 'Replay']

const RUBRIC = [
  ['Recognising change from baseline', 30, 'What differs from their usual, and how it develops'],
  ['Communication and action', 30, 'The right people hear it, in time, as observations'],
  ['Facts, assumptions and unknowns', 25, 'What was seen, kept apart from guesses and gaps'],
  ['Handover clarity', 15, 'Situation, background, timed observations, a clear request, unknowns'],
] as const

export default function Home() {
  const [main, ...more] = SCENARIOS
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div>
          <p className="eyebrow text-accent">Long-term-care training simulation</p>
          <h1 className="mt-2 text-[40px] leading-[1.05] sm:text-[52px]">Off day, or something more?</h1>
          <p className="mt-4 max-w-[58ch] text-[17px] text-ink-2">
            Evelyn eats a quarter of her breakfast, skips music group and stays in her room. On its own, that could be nothing. Play the shift: learn her
            usual, reveal what happens one event at a time, decide with only what you know, hand over clearly, and see your reasoning debriefed.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={`/play/?scenario=${main!.id}`} className="btn btn-primary btn-lg">
              Start with Evelyn →
            </Link>
            <span className="text-[13.5px] text-ink-3">About 8 minutes · no sign-in · fictional resident</span>
          </div>
        </div>
        <div className="card p-4 sm:p-5">
          <ForkVisual />
          <p className="mt-2 text-[13px] text-ink-3">
            The same Monday can go two ways. Your decisions are judged on what you knew at the time, never on how the day turned out.
          </p>
        </div>
      </section>

      <section aria-labelledby="loop">
        <h2 id="loop" className="sr-only">
          The learning loop
        </h2>
        <ol className="flex flex-wrap gap-2">
          {LOOP.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13.5px] font-medium">
                <span className="mr-1.5 text-ink-3 tabular-nums">{i + 1}</span>
                {s}
              </span>
              {i < LOOP.length - 1 && (
                <span aria-hidden="true" className="text-ink-3">
                  →
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="scenarios-title">
        <h2 id="scenarios-title" className="text-[24px]">
          Scenarios
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[main!, ...more].map((s, i) => (
            <article key={s.id} className={`card flex flex-col p-5 ${i === 0 ? 'border-2 border-accent/50' : ''}`}>
              <p className="eyebrow">
                {s.resident.name} · {s.resident.wing} wing
              </p>
              <h3 className="mt-1 text-[20px]">{s.title}</h3>
              <p className="mt-2 flex-1 text-[14px] text-ink-2">{s.blurb}</p>
              <Link href={`/play/?scenario=${s.id}`} className={`btn mt-4 self-start ${i === 0 ? 'btn-primary' : ''}`}>
                Play →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2" aria-label="How it works">
        <div className="card p-5">
          <h2 className="text-[20px]">How you’re scored</h2>
          <p className="mt-1 text-[13.5px] text-ink-3">An illustrative 100-point rubric. Every point comes from an explicit rule, explained in the debrief.</p>
          <ul className="mt-3 space-y-2.5">
            {RUBRIC.map(([label, pts, about]) => (
              <li key={label} className="flex items-start gap-3">
                <span className="w-9 shrink-0 rounded-md bg-accent-soft py-0.5 text-center text-[13px] font-bold text-accent-strong tabular-nums">{pts}</span>
                <span className="text-[14px]">
                  <b>{label}</b>
                  <span className="block text-[13px] text-ink-3">{about}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-ink-2">No points for naming a diagnosis, predicting a hospital transfer, or reaching the most dramatic ending.</p>
        </div>
        <div className="card p-5">
          <h2 className="text-[20px]">What’s under the hood</h2>
          <ul className="mt-3 space-y-2.5 text-[14px] text-ink-2">
            <li>
              <b className="text-ink">A deterministic scenario engine.</b> Events, branches and scores are written down in code and data. The same choices always
              lead to the same place.
            </li>
            <li>
              <b className="text-ink">PostgreSQL on Vultr.</b> Every attempt, decision, the evidence available when it was made, scores and handovers are
              saved. Replays are new attempts; old ones never change.
            </li>
            <li>
              <b className="text-ink">Gemini, only for the handover.</b> It turns facts you’ve seen into an SBAR draft you edit. It can’t add facts, and drafts
              that do are rejected for a standard template.
            </li>
          </ul>
          <Link href="/rationale/" className="link mt-3 inline-block text-[14px]">
            Research and design rationale →
          </Link>
        </div>
      </section>
    </div>
  )
}
