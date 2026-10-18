'use client'

import type { Debrief } from '@thread/engine'
import { ScoreLineRow, scoreTone } from './DecisionPanel'

function Ring({ value, max }: { value: number; max: number }) {
  const r = 44
  const c = 2 * Math.PI * r
  const tone = scoreTone(value, max)
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline score ring with a text alternative
    <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${value} out of ${max}`}>
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--color-sunken)" strokeWidth="10" />
      <circle
        cx="56"
        cy="56"
        r={r}
        fill="none"
        stroke={`var(--color-${tone})`}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(value / max) * c} ${c}`}
        transform="rotate(-90 56 56)"
      />
      <text x="56" y="56" textAnchor="middle" fontSize="28" fontWeight="700" fill="var(--color-ink)" fontFamily="var(--font-serif)">
        {value}
      </text>
      <text x="56" y="75" textAnchor="middle" fontSize="11.5" fill="var(--color-ink-3)">
        of {max}
      </text>
    </svg>
  )
}

function List({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone?: 'poor' | 'mid' }) {
  return (
    <div>
      <h3 className="font-sans text-[14.5px] font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-1.5 space-y-1.5">
          {items.map((x) => (
            <li key={x} className="flex gap-2 text-[13.5px] text-ink-2">
              <span aria-hidden="true" style={{ color: tone ? `var(--color-${tone})` : 'var(--color-ink-3)' }}>
                •
              </span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[13.5px] text-ink-3">{empty}</p>
      )}
    </div>
  )
}

export function DebriefPanel({
  debrief,
  name,
  busy,
  onReplay,
}: {
  debrief: Debrief
  name: string
  busy: boolean
  onReplay: (course: 'same' | 'other') => void
}) {
  const other = debrief.otherCourses[0]
  return (
    <section className="space-y-5" aria-labelledby="debrief-title">
      <div className="card reveal p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-5">
          <Ring value={debrief.total} max={debrief.max} />
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Debrief</p>
            <h2 id="debrief-title" className="mt-1 text-[26px]">
              {debrief.total >= 85 ? 'Clear, timely, grounded.' : debrief.total >= 60 ? 'Good instincts, with gaps.' : 'Worth another look.'}
            </h2>
            <p className="mt-1 max-w-[62ch] text-[14.5px] text-ink-2">
              In this run: <b>{debrief.course.summary}</b> Every decision was scored on what you knew
              at the time, so the way the day turned out didn’t change any earlier score.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {debrief.criteria.map((c) => {
            const tone = scoreTone(c.earned, c.max)
            return (
              <details key={c.key} className="group rounded-lg border border-line p-3">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="text-[14.5px]">{c.label}</b>
                    <span className="text-[14px] font-bold tabular-nums" style={{ color: `var(--color-${tone})` }}>
                      {c.earned}/{c.max}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${(c.earned / c.max) * 100}%`, background: `var(--color-${tone})` }} />
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-ink-3">
                    {c.about} <span className="text-accent group-open:hidden">Why ▸</span>
                  </p>
                </summary>
                <ul className="mt-2 space-y-2">
                  {c.lines.map((l) => (
                    <ScoreLineRow key={l.item} {...l} />
                  ))}
                </ul>
              </details>
            )
          })}
        </div>
        <p className="mt-3 text-[12px] text-ink-3">
          Illustrative prototype rubric: recognition 30, communication 30, facts vs. assumptions vs. unknowns 25, handover clarity 15. No points are given
          for naming a diagnosis, predicting an outcome or reaching a dramatic ending. Not a validated assessment.
        </p>
      </div>

      <div className="card p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <List title={`What changed from ${name}’s baseline`} items={debrief.deviations} empty="No changes below her usual were revealed in this run." />
          <List title="What wasn’t known" items={debrief.missing} empty="Nothing was flagged as unknown." tone="mid" />
          <List
            title="Where an assumption was treated as a fact"
            items={debrief.slips}
            empty="None. You kept what was seen apart from guesses and gaps throughout."
            tone="poor"
          />
          <div>
            <h3 className="font-sans text-[14.5px] font-semibold">What good communication looked like</h3>
            <ul className="mt-1.5 space-y-2">
              {debrief.communication.map((c) => (
                <li key={c.title} className="text-[13.5px] text-ink-2">
                  <b className="text-ink">{c.title}</b> {c.expected}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card p-5 sm:p-6">
        <h3 className="text-[19px]">If you’d chosen differently</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {debrief.alternatives.map((a) => (
            <div key={a.title}>
              <p className="text-[14px] font-semibold">{a.title}</p>
              <ul className="mt-2 space-y-2">
                {a.options.map((o) => {
                  const tone = scoreTone(o.earned, o.max)
                  return (
                    <li key={o.label} className={`rounded-lg border p-3 ${o.chosen ? 'border-ink' : 'border-line'}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <b className="text-[13.5px]">
                          {o.chosen && <span className="mr-1 rounded bg-ink px-1.5 py-px text-[11px] text-white">You</span>}
                          {o.label}
                        </b>
                        <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color: `var(--color-${tone})` }}>
                          {o.earned}/{o.max}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-2">{o.feedback}</p>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card border-2 border-accent/60 p-5 sm:p-6">
        <p className="font-serif text-[19px] leading-snug">“{debrief.insight}”</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {other && (
            <button className="btn btn-primary btn-lg" onClick={() => onReplay('other')} disabled={busy}>
              Replay: the other version of the day
            </button>
          )}
          <button className="btn btn-lg" onClick={() => onReplay('same')} disabled={busy}>
            Replay this version
          </button>
        </div>
        {other && (
          <p className="mt-3 text-[13.5px] text-ink-2">
            In the other version of the day: {other.summary} Try the same choices there: your Monday 11:00 score will be
            identical, because it depends on what you knew at 11:00, not on how the day turned out. Replays are new attempts; this one stays as it is.
          </p>
        )}
      </div>
    </section>
  )
}
