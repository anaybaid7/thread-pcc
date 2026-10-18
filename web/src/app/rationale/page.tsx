import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Why it’s built this way' }

const PRINCIPLES: [string, string][] = [
  ['Baseline first', 'A change only means something against the resident’s usual.'],
  ['Two futures', 'The same Monday can resolve or persist.'],
  ['No hindsight', 'Decisions are scored on what was known at the time.'],
  ['Fact, assumption, unknown', 'Kept apart in every decision and handover.'],
  ['Offered is not consumed', 'An attempt is not an outcome.'],
  ['AI drafts, people decide', 'Gemini only phrases the handover.'],
]

const SOURCES: [string, string, string][] = [
  ['Liu et al., Nurse Education Today, 2023', 'https://doi.org/10.1016/j.nedt.2023.105838', 'Education for recognising deterioration: practice plus debrief.'],
  ['Kay et al., J Applied Gerontology, 2022', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9981342/', 'SBAR training in nursing homes, refined in PDSA cycles.'],
  ['Renz et al., Geriatric Nursing, 2013', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3932321/', 'SBAR in long-term care: structure helps staff organise what they know.'],
  ['AHRQ, Communicating Change in a Resident’s Condition', 'https://www.ahrq.gov/patient-safety/settings/long-term-care/resource/facilities/ltc/mod2concl.html', 'Noticing is not enough: tell someone, in time, without blame.'],
]

export default function Rationale() {
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Design rationale</p>
        <h1 className="mt-1 text-[34px]">Why it’s built this way</h1>
      </div>

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {PRINCIPLES.map(([t, d]) => (
          <li key={t} className="card border-t-2 border-t-ink p-4">
            <h2 className="text-[17px]">{t}</h2>
            <p className="mt-0.5 text-[13.5px] text-ink-2">{d}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="sources" className="card p-5">
        <h2 id="sources" className="text-[20px]">
          Sources
        </h2>
        <ol className="mt-3 divide-y divide-line">
          {SOURCES.map(([t, href, d]) => (
            <li key={href} className="py-3">
              <a href={href} className="link text-[14.5px]" target="_blank" rel="noreferrer">
                {t}
              </a>
              <p className="text-[13.5px] text-ink-2">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[12.5px] text-ink-3">These shaped the design. They don’t validate THREAD or its score.</p>
      </section>

      <section className="card border-dashed p-5" aria-labelledby="limits">
        <h2 id="limits" className="text-[18px]">
          Limits
        </h2>
        <ul className="mt-2 grid gap-1.5 text-[13.5px] text-ink-2 sm:grid-cols-2">
          <li>• Synthetic residents; illustrative values</li>
          <li>• Rubric not yet clinically validated</li>
          <li>• Needs educator review before real use</li>
          <li>• No diagnosis, prediction or treatment advice</li>
        </ul>
        <Link href="/play/?scenario=evelyn" className="btn btn-primary mt-4">
          Play a scenario
        </Link>
      </section>
    </div>
  )
}
