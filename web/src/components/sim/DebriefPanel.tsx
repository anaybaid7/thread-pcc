'use client'

import { getScenario, type AttemptView, type Criterion } from '@thread/engine'
import { useState } from 'react'
import { toneOf } from '../motion'
import { DecisionMap } from './DecisionMap'
import { ScoreBar } from './DecisionPanel'
import { OutcomeMatrix } from './OutcomeMatrix'

const LABEL: Record<Criterion, string> = {
  recognition: 'Recognition',
  communication: 'Communication',
  evidence: 'Fact vs. assumption',
  handover: 'Handover',
}
const SEG: Record<Criterion, string> = {
  recognition: 'var(--color-accent)',
  communication: 'var(--color-mobility)',
  evidence: 'var(--color-mid)',
  handover: 'var(--color-engagement)',
}

type Tab = 'changed' | 'unknown' | 'slips'

export function DebriefPanel({ view, busy, onReplay }: { view: AttemptView; busy: boolean; onReplay: (course: 'same' | 'other') => void }) {
  const d = view.debrief!
  const [tab, setTab] = useState<Tab>('changed')
  const [mapCourse, setMapCourse] = useState(d.course.id)
  const scenario = getScenario(view.scenario.id)
  const sameVersion = scenario?.version === view.scenario.version
  const forked = d.otherCourses.length > 0 && (d.course.id === 'persist' || d.course.id === 'resolve')
  const decisions = view.timeline.filter((t) => t.type === 'decision')
  const chosen = Object.fromEntries(decisions.map((x) => [x.id, x.choiceId]))
  const first = decisions[0]
  const tone = toneOf(d.total, d.max)

  return (
    <section className="space-y-5" aria-labelledby="debrief-title">
      <div className="card enter p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Debrief</p>
            <h2 id="debrief-title" className="mt-1 text-[24px]">
              {view.scenario.title}
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-3">{d.course.summary}</p>
          </div>
          <p id="debrief-score" className="text-right">
            <span className="font-serif text-[52px] leading-none font-semibold tabular-nums" style={{ color: `var(--color-${tone})` }}>
              {d.total}
            </span>
            <span className="font-mono text-[15px] text-ink-3"> / {d.max}</span>
          </p>
        </div>

        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a static bar with a text alternative */}
        <div className="mt-5 flex h-4 overflow-hidden rounded-sm" role="img" aria-label={d.criteria.map((c) => `${LABEL[c.key]} ${c.earned} of ${c.max}`).join(', ')}>
          {d.criteria.map((c) => (
            <span key={c.key} className="relative h-full border-r-2 border-surface last:border-r-0" style={{ width: `${c.max}%`, background: 'var(--color-sunken)' }}>
              <span className="absolute inset-y-0 left-0" style={{ width: `${(c.earned / c.max) * 100}%`, background: SEG[c.key] }} />
            </span>
          ))}
        </div>
        <ul className="mt-5 space-y-3">
          {d.criteria.map((c) => (
            <ScoreBar key={c.key} label={LABEL[c.key]} line={{ earned: c.earned, max: c.max, reason: c.lines.map((l) => `${l.item.replace(/^.*? · /, '')}: ${l.reason}`).join('  ') }} />
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-ink-3">Every decision was scored on the entries visible when it was made. Prototype rubric; not a validated assessment.</p>
      </div>

      {forked && first && (
        <div className="card p-5 sm:p-6">
          <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <OutcomeMatrix
              quality={first.earned / first.max}
              course={d.course.id as 'persist' | 'resolve'}
              labels={{ resolve: 'Got better by Tuesday', persist: 'Got worse by Tuesday' }}
            />
            <div className="space-y-3">
              <p className="eyebrow">Decision vs. outcome</p>
              <h3 className="text-[20px] leading-snug">
                Your Monday decision scored {first.earned} of {first.max}, whichever way Tuesday went.
              </h3>
              <p className="text-[14px] text-ink-2">
                Judging a decision by its outcome is a well-documented bias. Here the outcome is a coin you don’t control; the decision is what you can train.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button className="btn btn-primary" onClick={() => onReplay('other')} disabled={busy}>
                  Play the other version
                </button>
                <button className="btn" onClick={() => onReplay('same')} disabled={busy}>
                  Replay this version
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {scenario && sameVersion && (
        <div className="card p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Decision map</p>
              <h3 className="mt-1 text-[20px]">What every choice would have led to</h3>
            </div>
            {scenario.courses.length > 1 && (
              <fieldset className="flex gap-0.5 rounded-lg bg-sunken p-0.5 text-[12.5px] font-medium">
                <legend className="sr-only">Version of the day</legend>
                {scenario.courses.map((c) => (
                  <button key={c.id} type="button" aria-pressed={mapCourse === c.id} onClick={() => setMapCourse(c.id)} className={`rounded-md px-2.5 py-1 ${mapCourse === c.id ? 'bg-surface shadow-sm' : 'text-ink-3'}`}>
                    {c.label}
                    {c.id === d.course.id ? ' (this run)' : ''}
                  </button>
                ))}
              </fieldset>
            )}
          </div>
          <DecisionMap scenario={scenario} course={mapCourse} chosen={chosen} />
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Debrief details</legend>
          {(
            [
              ['changed', 'Changes from usual', d.deviations.length],
              ['unknown', 'Not known', d.missing.length],
              ['slips', 'Assumptions treated as fact', d.slips.length],
            ] as [Tab, string, number][]
          ).map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold ${tab === id ? 'bg-ink text-white' : 'bg-sunken text-ink-2 hover:bg-line'}`}
            >
              {label} <span className="ml-0.5 font-mono opacity-60">{n}</span>
            </button>
          ))}
        </fieldset>
        <ul key={tab} className="enter mt-4 divide-y divide-line text-[13.5px]">
          {(tab === 'changed' ? d.deviations : tab === 'unknown' ? d.missing : d.slips).map((x) => (
            <li key={x} className="grid grid-cols-[72px_1fr] gap-3 py-2">
              <span className="font-mono text-[12px] text-ink-3">{/^\w{3} \d\d:\d\d/.test(x) ? x.slice(0, 9) : ''}</span>
              <span className="text-ink-2">{/^\w{3} \d\d:\d\d · /.test(x) ? x.slice(12) : x}</span>
            </li>
          ))}
          {(tab === 'changed' ? d.deviations : tab === 'unknown' ? d.missing : d.slips).length === 0 && <li className="py-2 text-ink-3">None.</li>}
        </ul>
      </div>
      {!forked && (
        <div className="flex justify-center">
          <button className="btn btn-primary" onClick={() => onReplay('same')} disabled={busy}>
            Play again
          </button>
        </div>
      )}
    </section>
  )
}
