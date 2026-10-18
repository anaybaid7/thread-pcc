import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Why it works this way' }

const POINTS: [string, string, string, string][] = [
  [
    'Changes are seen first by aides',
    'The first signs are soft (ate less, stayed in, quieter) and are noticed by PSWs and aides, the people who provide most direct care.',
    'INTERACT’s Stop and Watch card exists for exactly this moment.',
    'https://www.commonwealthfund.org/publications/other-publication/2010/aug/interact-ii-education-and-clinical-tools-reducing-transfers',
  ],
  [
    'Against their own usual',
    'A quarter of a breakfast only means something next to “usually eats most of it”. Readings are compared with the resident’s own ranges, not a population threshold.',
    'In a Quebec study nurses detected delirium in 13% of residents who had it; detection depends on knowing the person.',
    'https://pmc.ncbi.nlm.nih.gov/articles/PMC2277396',
  ],
  [
    'Tools alone don’t close the loop',
    'In a cluster trial of 85 homes, giving staff INTERACT’s tools did not reduce hospitalizations overall. Uptake was the problem, so THREAD makes the follow-through the product.',
    'Kane et al., JAMA Internal Medicine, 2017.',
    'https://psnet.ahrq.gov/issue/effects-intervention-reduce-hospitalizations-nursing-homes-randomized-implementation-trial',
  ],
  [
    'Structured escalation',
    'SBAR gives the nurse a structure for calling the NP. The evidence is moderate, and works best when it fits the workflow rather than being filled in afterwards.',
    'Müller et al., BMJ Open 2018; Kay et al., J Appl Gerontol 2022.',
    'https://bmjopen.bmj.com/content/8/8/e022202',
  ],
  [
    'Offered is not consumed',
    'A chart that says “fluids offered” records an attempt. THREAD flags repeated offers with no amount until something is measured.',
    'In one care-home study staff fluid charts were off by about 700 mL a day.',
    'https://ueaeprints.uea.ac.uk/50440/',
  ],
  [
    'Closed only on an outcome',
    'A concern can’t be closed because someone did something. It closes when each changed area is recorded back to usual.',
    'Missed care is mostly care left undone between people and shifts.',
    'https://nursingworld.org/nurses-books/errors-of-omission-how-missed-nursing-care-imperils-patients',
  ],
]

export default function Rationale() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Why it works this way</p>
        <h1 className="mt-1 text-[32px]">The problem is the relay</h1>
        <p className="mt-2 max-w-[64ch] text-[15px] text-ink-2">
          Early signs are rarely missed by everyone. They are noticed by one person and lost between people: not passed on, passed on but not checked,
          checked but not followed up at the shift change.
        </p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {POINTS.map(([t, d, e, href]) => (
          <li key={t} className="card border-t-2 border-t-ink p-4">
            <h2 className="text-[17px]">{t}</h2>
            <p className="mt-1 text-[14px] text-ink-2">{d}</p>
            <p className="mt-2 text-[12.5px] text-ink-3">
              {e}{' '}
              <a className="link" href={href} target="_blank" rel="noreferrer">
                Source
              </a>
            </p>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Sources inform the design; they do not validate THREAD. Synthetic data, illustrative ranges, not clinical advice.
      </p>
    </div>
  )
}
