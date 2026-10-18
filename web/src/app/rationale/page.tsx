import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Research & design rationale' }

const SOURCES = [
  {
    title: 'The effectiveness of education strategies for nurses to recognise and manage clinical deterioration: A systematic review',
    where: 'Nurse Education Today, 2023',
    href: 'https://doi.org/10.1016/j.nedt.2023.105838',
    implication:
      'Informs the format: a structured prebrief, a genuine practice experience with interactive decisions, and a debrief. We treat it as rationale for the format, not as evidence that this prototype works.',
    where_in_thread: 'The “Before the shift” prebrief, the decision points with immediate feedback, and the debrief with replay.',
  },
  {
    title: 'Improving Communication in Nursing Homes Using Plan-Do-Study-Act Cycles of an SBAR Training Program',
    where: '2023 · PubMed Central',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9981342/',
    implication:
      'Makes communication a first-class skill: describe the change clearly, give relevant background, document observations, and name an appropriate request or next step.',
    where_in_thread: 'Communication is 30 of 100 points, and every attempt ends with an SBAR handover the player writes and is scored on.',
  },
  {
    title: 'Examining the feasibility and utility of an SBAR protocol in long-term care',
    where: '2013 · PubMed Central',
    href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3932321/',
    implication:
      'A handover should be useful and structured, not just a polished paragraph: easy to see what changed, what is known and what is missing.',
    where_in_thread: 'The editor keeps S, B, A and R separate, ties each section to cited facts, and has a dedicated “What isn’t known” list.',
  },
  {
    title: 'Communicating Change in a Resident’s Condition',
    where: 'Agency for Healthcare Research and Quality (AHRQ), long-term care module',
    href: 'https://www.ahrq.gov/patient-safety/settings/long-term-care/resource/facilities/ltc/mod2concl.html',
    implication: 'Noticing a change is not enough: timely communication and follow-through matter, and feedback should not be blame-oriented.',
    where_in_thread: 'Choices that notice but don’t tell anyone lose communication points; feedback explains what was reasonable at the time instead of assigning blame.',
  },
]

const PRINCIPLES = [
  ['Change is relative to her baseline', 'Evelyn’s usual week comes first. “Ate a quarter” only means something next to “usually eats most”.'],
  ['One observation can be ambiguous', 'The same Monday morning leads to two different Tuesdays. Neither ending makes the 11:00 decision right or wrong.'],
  ['Judged on what was known then', 'Each decision stores the events revealed at that moment; its score uses nothing else. Hindsight never changes a score.'],
  ['Observed, assumed, unknown', 'Players sort statements into the three. “No record of fluids” is never treated as “drank enough”.'],
  ['Offered is not consumed', 'Fluid records distinguish what was offered from what was drunk, and the handover keeps them apart.'],
  ['AI organises, people decide', 'Gemini only rephrases supplied facts into an editable draft. Branching, outcomes and scores are deterministic code.'],
]

export default function Rationale() {
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Research &amp; design rationale</p>
        <h1 className="mt-1 text-[34px]">Why THREAD is built this way</h1>
        <p className="mt-2 max-w-[70ch] text-[15.5px] text-ink-2">
          THREAD is a hackathon prototype. The sources below shaped its learning design. They do not validate THREAD, its scenarios or its scoring, and they
          do not show that it improves resident outcomes. It needs expert review and formal evaluation before any real-world use.
        </p>
      </div>

      <section aria-labelledby="principles" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <h2 id="principles" className="sr-only">
          Design principles
        </h2>
        {PRINCIPLES.map(([t, d]) => (
          <div key={t} className="card p-4">
            <h3 className="text-[16.5px]">{t}</h3>
            <p className="mt-1 text-[14px] text-ink-2">{d}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="sources-title">
        <h2 id="sources-title" className="text-[24px]">
          Sources and what we took from them
        </h2>
        <ol className="mt-4 space-y-3">
          {SOURCES.map((s, i) => (
            <li key={s.href} className="card p-5">
              <p className="eyebrow">
                {i + 1} · {s.where}
              </p>
              <h3 className="mt-1 text-[17px]">
                <a href={s.href} className="link" target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              </h3>
              <p className="mt-2 text-[14.5px]">
                <b>Design implication.</b> {s.implication}
              </p>
              <p className="mt-1 text-[14px] text-ink-2">
                <b className="text-ink">In THREAD:</b> {s.where_in_thread}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="card p-5" aria-labelledby="limits">
        <h2 id="limits" className="text-[22px]">
          Limitations
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] text-ink-2">
          <li>All residents, staff, events and values are synthetic. Chart values are illustrative indices (100 = her usual), not clinical measurements or thresholds.</li>
          <li>The rubric and its point values are a transparent prototype, written by the team, not a validated assessment instrument.</li>
          <li>Scenario content has not been reviewed by long-term-care clinicians or educators. It should be before any use with staff.</li>
          <li>THREAD does not diagnose, predict deterioration or hospitalisation, recommend treatment, or replace staff assessment or facility procedures.</li>
          <li>Gemini drafts can be wrong even after the server’s checks; they are marked as AI-assisted and must be reviewed and edited.</li>
        </ul>
        <Link href="/play/?scenario=evelyn" className="btn btn-primary mt-4">
          Play Evelyn’s day →
        </Link>
      </section>
    </div>
  )
}
