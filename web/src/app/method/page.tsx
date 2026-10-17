import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageTitle, Panel, StateChip, Sticky } from '@/components/ui'
import type { State } from '@/lib/types'

export const metadata: Metadata = { title: 'How it works' }

const STEPS: { title: string; body: string; who: 'rules' | 'nlp' }[] = [
  { title: 'Normalize', body: 'Measurements are compared with the resident’s own care-plan target. Event time and entry time are kept apart; re-imports collapse.', who: 'rules' },
  { title: 'Read notes', body: 'ConText-style extraction: negation, plans vs done, offered vs drank, hedges, relayed history, someone else. Every event keeps its exact span.', who: 'nlp' },
  { title: 'Link', body: 'Same resident, same concern, inside a window. Each link has a relationship and a reason. Unclear evidence stays unlinked for a person.', who: 'rules' },
  { title: 'Decide', body: 'A deterministic state machine over the linked evidence, replayable at any handover. No opaque score.', who: 'rules' },
  { title: 'Explain', body: 'Cited sentences, validated: no uncited claim, no number outside the evidence, no diagnostic or blaming language.', who: 'rules' },
]

const STATES: [State, string][] = [
  ['persistent_signal', 'A later observation still meets the concern rule.'],
  ['new_signal', 'A concerning observation, and no response documented since.'],
  ['unverified', 'A response is documented; the records do not establish the outcome.'],
  ['ambiguous', 'A note without an amount, a missing baseline, or a note and a measurement that disagree.'],
  ['response_documented', 'A response is documented and the follow-up window is still open.'],
  ['outcome_verified', 'A measurement meets the target inside the window, or a bedside check does.'],
]

function Ref({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="underline decoration-2 underline-offset-4" target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

export default function MethodPage() {
  return (
    <>
      <PageTitle kicker="How it works" title={<>From scattered notes to a thread you can <span className="scribble">check</span></>} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel title="The pipeline">
            <ol className="grid gap-3 sm:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="panel p-3" style={s.who === 'nlp' ? { background: 'var(--color-sticky)' } : undefined}>
                  <p className="label">Step {i + 1}</p>
                  <p className="font-bold">{s.title}</p>
                  <p className="mt-1 text-[13.5px] text-ink-2">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[14px] text-ink-2">
              The yellow step is where language understanding happens. A language model can replace or check it (see Evaluation);
              every step after it is deterministic, so the model extracts and the rules decide.
            </p>
          </Panel>

          <Panel title="Six states, never resolved: true/false">
            <ul className="space-y-2">
              {STATES.map(([s, d]) => (
                <li key={s} className="grid gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
                  <span>
                    <StateChip state={s} />
                  </span>
                  <span className="text-[14.5px]">{d}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[14px] text-ink-2">
              A completed task is not a resolved concern, and missing documentation is not proof a task was never done. Both are
              built into the state model rather than left to wording.
            </p>
          </Panel>

          <Panel title="Rules you can read">
            <ul className="list-disc space-y-1.5 pl-5 text-[14.5px]">
              <li>A measurement below the resident’s care-plan target, a documented refusal, or a described decline opens a thread.</li>
              <li>Signals at least 90 minutes apart are a recurrence; closer together they are one occurrence.</li>
              <li>An event joins an open thread if it is within 24 hours of the thread’s latest evidence.</li>
              <li>Follow-up window: 8 h for fluid intake, 12 h for mobility. <b>Demonstration rule, not clinical guidance.</b></li>
              <li>An entry recorded more than an hour after the event is a late entry; earlier handovers did not see it.</li>
              <li>Review order: persistent, unanswered, unverified, ambiguous. Within a group, the longest-open first.</li>
            </ul>
          </Panel>

          <Panel title="Where THREAD sits next to what already exists">
            <p className="text-[14.5px]">
              PointClickCare already offers early change detection, clinical guidance and change-in-condition workflows (
              <Ref href="https://pointclickcare.com/products/einteract/">eINTERACT</Ref>,{' '}
              <Ref href="https://pointclickcare.com/products/nursing-advantage/">Nursing Advantage</Ref>), and hydration products
              track fluids. THREAD does not claim those don’t exist. It prototypes one narrower interaction: reconstructing an
              evidence-linked, cross-shift thread from measurements and free-text notes, separating a documented action from a
              verified outcome, and showing uncertainty instead of hiding it. Whether that adds value beyond existing workflows
              is a question for real users.
            </p>
          </Panel>

          <Panel title="Grounding">
            <ul className="list-disc space-y-1.5 pl-5 text-[14.5px]">
              <li>
                A 2025 scoping review of 26 studies of acute-deterioration tools in long-term care found better staff confidence and
                communication, but little robust evidence of better resident outcomes (
                <Ref href="https://pmc.ncbi.nlm.nih.gov/articles/PMC12117722/">BMC Health Services Research</Ref>). So THREAD does
                not claim to prevent emergencies.
              </li>
              <li>
                A 2025 systematic review of long-term-care documentation quality found completeness improves with interventions, with
                very low certainty, and accuracy and timeliness little studied (
                <Ref href="https://pubmed.ncbi.nlm.nih.gov/40024615/">PubMed 40024615</Ref>). So THREAD treats the record as
                imperfect: “not documented” does not mean “not done”.
              </li>
              <li>
                AHRQ long-term-care guidance stresses knowing a resident’s baseline, noticing deviation, and communicating it across
                the team. So threads connect baseline, change, response, later evidence and handover.
              </li>
              <li>ConText (Harkema et al., 2009) and NegEx: the clinical-NLP algorithms behind the note reader.</li>
            </ul>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Sticky tilt={0.8}>
            <p className="font-bold">What THREAD does not do</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14.5px]">
              <li>Diagnose, or name a condition</li>
              <li>Predict falls, transfers or mortality</li>
              <li>Recommend a treatment</li>
              <li>Mark a concern resolved because someone did something</li>
              <li>Blame anyone for a gap in the record</li>
              <li>Touch real resident data</li>
            </ul>
          </Sticky>
          <Panel title="Built with">
            <ul className="space-y-1 text-[14.5px]">
              <li>Python engine, FastAPI, Pydantic, SQLite</li>
              <li>Next.js, TypeScript, Tailwind, TanStack Query</li>
              <li>Optional language-model extractor with span checks</li>
              <li>pytest for every scenario; labelled evaluation</li>
            </ul>
          </Panel>
          <Panel title="Future interoperability">
            <p className="text-[14.5px]">
              The event model maps onto HL7 FHIR Observation, CarePlan and Task. Not implemented in this prototype.
            </p>
          </Panel>
        </aside>
      </div>
    </>
  )
}
