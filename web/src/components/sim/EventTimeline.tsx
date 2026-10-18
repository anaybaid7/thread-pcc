'use client'

import type { AttemptView, EventKind, TimelineItem } from '@thread/engine'
import { useEffect, useRef } from 'react'

export const KIND: Record<EventKind, { label: string; color: string; about: string }> = {
  observation: { label: 'Observed', color: 'var(--color-observation)', about: 'Someone saw or heard it' },
  documentation: { label: 'Documented', color: 'var(--color-documentation)', about: 'Written in a record' },
  action: { label: 'Action taken', color: 'var(--color-action)', about: 'Someone did something' },
  unknown: { label: 'Not known', color: 'var(--color-unknown)', about: 'Not recorded or not asked' },
}

function KindMark({ kind }: { kind: EventKind }) {
  const k = KIND[kind]
  return kind === 'unknown' ? (
    <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border-2 border-dashed bg-surface text-[12px] font-bold" style={{ borderColor: k.color, color: k.color }}>
      ?
    </span>
  ) : kind === 'action' ? (
    <span aria-hidden="true" className="grid size-6 place-items-center rounded-full text-white" style={{ background: k.color }}>
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.5l2.3 2.2 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </span>
  ) : kind === 'documentation' ? (
    <span aria-hidden="true" className="grid size-6 place-items-center rounded-md border-2 bg-surface" style={{ borderColor: k.color }}>
      <span className="h-0.5 w-2.5 rounded" style={{ background: k.color, boxShadow: `0 3px 0 ${k.color}, 0 -3px 0 ${k.color}` }} />
    </span>
  ) : (
    <span aria-hidden="true" className="grid size-6 place-items-center rounded-full border-2 bg-surface" style={{ borderColor: k.color }}>
      <span className="size-2.5 rounded-full" style={{ background: k.color }} />
    </span>
  )
}

export function KindLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2" aria-label="Timeline key">
      {(Object.keys(KIND) as EventKind[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5" title={KIND[k].about}>
          <span className="scale-[0.8]">
            <KindMark kind={k} />
          </span>
          {KIND[k].label}
        </li>
      ))}
    </ul>
  )
}

function EventRow({ item, fresh }: { item: Extract<TimelineItem, { type: 'event' }>; fresh: boolean }) {
  const k = KIND[item.kind]
  return (
    <li className={`relative flex gap-3 pb-4 ${fresh ? 'reveal' : ''}`}>
      <div className="relative z-10 pt-0.5">
        <KindMark kind={item.kind} />
      </div>
      <div className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 ${item.kind === 'unknown' ? 'border-dashed bg-[#fbf6f0]' : 'border-line bg-surface'} ${fresh ? 'ring-2 ring-accent/25' : ''}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12.5px]">
          <b className="text-[13.5px] text-ink tabular-nums">
            {item.day.slice(0, 3)} {item.clock}
          </b>
          <span className="font-semibold" style={{ color: k.color }}>
            {k.label}
          </span>
          <span className="text-ink-3">· {item.source}</span>
        </div>
        <p className="mt-1 text-[14.5px] leading-snug">{item.text}</p>
        {item.quote && <p className="mt-1.5 border-l-2 border-line-strong pl-2.5 font-serif text-[15px] text-ink-2 italic">“{item.quote}”</p>}
      </div>
    </li>
  )
}

function DecisionRow({ item, fresh }: { item: Extract<TimelineItem, { type: 'decision' }>; fresh: boolean }) {
  const pct = item.earned / item.max
  const tone = pct >= 0.8 ? 'good' : pct >= 0.5 ? 'mid' : 'poor'
  return (
    <li className={`relative flex gap-3 pb-4 ${fresh ? 'reveal' : ''}`}>
      <div className="relative z-10 grid size-6 place-items-center rounded-md bg-ink text-[11px] font-bold text-white" aria-hidden="true">
        ◆
      </div>
      <div className="min-w-0 flex-1 rounded-lg border-2 border-ink/80 bg-surface px-3 py-2.5">
        <p className="text-[12.5px] font-semibold text-ink-3">
          {item.day.slice(0, 3)} {item.clock} · Your decision
        </p>
        <p className="mt-0.5 text-[14.5px] font-medium">{item.choice}</p>
        <p className="mt-1 text-[12.5px] font-semibold" style={{ color: `var(--color-${tone})` }}>
          {item.earned} of {item.max} points for this decision
        </p>
      </div>
    </li>
  )
}

export function EventTimeline({ view }: { view: AttemptView }) {
  const end = useRef<HTMLSpanElement>(null)
  const count = view.timeline.length
  const last = view.timeline[count - 1]
  // Follow new events as they arrive, but don't jump when the timeline first appears.
  const seen = useRef(count)
  useEffect(() => {
    if (count > seen.current) end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    seen.current = count
  }, [count])

  // Group consecutive items under their section heading (e.g. "Monday · day shift").
  const groups: { section: string; items: TimelineItem[] }[] = []
  for (const it of view.timeline) {
    const section = it.type === 'event' ? it.section : (groups[groups.length - 1]?.section ?? '')
    const g = groups[groups.length - 1]
    if (g && g.section === section) g.items.push(it)
    else groups.push({ section, items: [it] })
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="timeline-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="timeline-title" className="text-[19px]">
          Timeline
        </h2>
        <KindLegend />
      </div>
      {count === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line-strong p-4 text-[14px] text-ink-3">
          Nothing has happened yet. Read {view.scenario.resident.preferredName}’s usual pattern, then start the shift.
        </p>
      ) : (
        <div aria-live="polite" aria-relevant="additions" className="mt-4">
          {groups.map((g, gi) => (
            <div key={`${g.section}-${gi}`}>
              <h3 className="eyebrow mb-2 font-sans">{g.section}</h3>
              <ol className="relative before:absolute before:top-2 before:bottom-4 before:left-[11px] before:w-px before:bg-line-strong">
                {g.items.map((it) =>
                  it.type === 'event' ? (
                    <EventRow key={`e-${it.id}`} item={it} fresh={it === last} />
                  ) : (
                    <DecisionRow key={`d-${it.id}`} item={it} fresh={it === last} />
                  ),
                )}
              </ol>
            </div>
          ))}
          <span ref={end} />
        </div>
      )}
    </section>
  )
}
