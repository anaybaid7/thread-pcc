'use client'

import type { AttemptView, EventKind, TimelineItem } from '@thread/engine'
import { useEffect, useRef, useState } from 'react'
import { toneOf } from '../motion'

export const KIND: Record<EventKind, { label: string; color: string }> = {
  observation: { label: 'Observed', color: 'var(--color-observation)' },
  documentation: { label: 'Charted', color: 'var(--color-documentation)' },
  action: { label: 'Action', color: 'var(--color-action)' },
  unknown: { label: 'Not known', color: 'var(--color-unknown)' },
}

export function KindMark({ kind, size = 24 }: { kind: EventKind; size?: number }) {
  const c = KIND[kind].color
  const s = { width: size, height: size }
  if (kind === 'unknown')
    return (
      <span aria-hidden="true" style={{ ...s, borderColor: c, color: c }} className="grid shrink-0 place-items-center rounded-full border-2 border-dashed bg-surface text-[12px] font-bold">
        ?
      </span>
    )
  if (kind === 'action')
    return (
      <span aria-hidden="true" style={{ ...s, background: c }} className="grid shrink-0 place-items-center rounded-full text-white">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.5 6.5l2.3 2.2 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </span>
    )
  if (kind === 'documentation')
    return (
      <span aria-hidden="true" style={{ ...s, borderColor: c }} className="grid shrink-0 place-items-center rounded-md border-2 bg-surface">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2.5 3.5h7M2.5 6h7M2.5 8.5h4.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    )
  return (
    <span aria-hidden="true" style={{ ...s, borderColor: c }} className="grid shrink-0 place-items-center rounded-full border-2 bg-surface">
      <svg width="13" height="13" viewBox="0 0 14 14">
        <path d="M1 7s2.3-4 6-4 6 4 6 4-2.3 4-6 4-6-4-6-4z" fill="none" stroke={c} strokeWidth="1.5" />
        <circle cx="7" cy="7" r="1.8" fill={c} />
      </svg>
    </span>
  )
}

export function KindLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2" aria-label="Key">
      {(Object.keys(KIND) as EventKind[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <KindMark kind={k} size={18} />
          {KIND[k].label}
        </li>
      ))}
    </ul>
  )
}

function EventRow({ item, fresh }: { item: Extract<TimelineItem, { type: 'event' }>; fresh: boolean }) {
  const [open, setOpen] = useState(false)
  const k = KIND[item.kind]
  const unknown = item.kind === 'unknown'
  return (
    <li className={`relative flex gap-3 pb-3 ${fresh ? 'enter' : ''}`}>
      <div className="relative z-10 pt-2">
        <KindMark kind={item.kind} />
      </div>
      <div
        className={`min-w-0 flex-1 rounded-xl border transition-shadow ${unknown ? 'border-dashed border-unknown/50 bg-[#fbf6f0]' : 'border-line bg-surface'} ${fresh ? 'ring-1 ring-accent/50' : ''}`}
      >
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-2 px-3 py-2 text-left">
          <span className="mt-px shrink-0 font-mono text-[12px] font-medium text-ink-2 tabular-nums">
            {item.day.slice(0, 3)} {item.clock}
          </span>
          <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-medium">{item.fact}</span>
          <span aria-hidden="true" className={`mt-0.5 text-[11px] text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▸
          </span>
        </button>
        {item.quote && <p className="mx-3 mb-2 border-l-2 border-accent/40 pl-2.5 font-serif text-[14.5px] text-ink-2 italic">“{item.quote}”</p>}
        {open && (
          <div className="pop border-t border-line px-3 py-2 text-[13.5px] text-ink-2">
            <p>{item.text}</p>
            <p className="mt-1 text-[12px] font-medium" style={{ color: k.color }}>
              {k.label} · {item.source}
            </p>
          </div>
        )}
      </div>
    </li>
  )
}

function DecisionRow({ item, fresh }: { item: Extract<TimelineItem, { type: 'decision' }>; fresh: boolean }) {
  const tone = toneOf(item.earned, item.max)
  return (
    <li className={`relative flex gap-3 pb-3 ${fresh ? 'enter' : ''}`}>
      <div className="relative z-10 ml-1 size-4 shrink-0 rotate-45 bg-ink" aria-hidden="true" style={{ marginTop: 12 }} />
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border-2 border-ink/85 bg-surface px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">
            {item.day.slice(0, 3)} {item.clock} · your decision
          </span>
          <span className="block text-[14px] font-medium">{item.choice}</span>
        </span>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-bold tabular-nums" style={{ background: `var(--color-${tone}-soft)`, color: `var(--color-${tone})` }}>
          {item.earned}/{item.max}
        </span>
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

  const groups: { section: string; items: TimelineItem[] }[] = []
  for (const it of view.timeline) {
    const section = it.type === 'event' ? it.section : (groups[groups.length - 1]?.section ?? '')
    const g = groups[groups.length - 1]
    if (g && g.section === section) g.items.push(it)
    else groups.push({ section, items: [it] })
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="timeline-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="timeline-title" className="text-[18px]">
          Entries
        </h2>
        <KindLegend />
      </div>
      {count === 0 ? (
        <p className="mt-4 grid place-items-center rounded-xl border border-dashed border-line-strong py-8 text-[14px] text-ink-3">Nothing yet.</p>
      ) : (
        <div aria-live="polite" aria-relevant="additions" className="mt-3">
          {groups.map((g, gi) => (
            <div key={`${g.section}-${gi}`}>
              <h3 className="eyebrow mb-2 font-sans">{g.section}</h3>
              <ol className="relative before:absolute before:top-3 before:bottom-4 before:left-[11px] before:w-px before:bg-line-strong">
                {g.items.map((it) =>
                  it.type === 'event' ? <EventRow key={`e-${it.id}`} item={it} fresh={it === last} /> : <DecisionRow key={`d-${it.id}`} item={it} fresh={it === last} />,
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

/** Advance the shift one entry at a time. A track shows where the clock is in the shift and the entries so far. */
export function TransportBar({ view, onNext, busy }: { view: AttemptView; onNext: () => void; busy: boolean }) {
  const { start, end } = view.window
  const now = view.window.now ?? start
  const pct = (t: number) => `${((Math.min(Math.max(t, start), end) - start) / (end - start)) * 100}%`
  const events = view.timeline.filter((t) => t.type === 'event')
  const decisions = view.timeline.filter((t) => t.type === 'decision')
  const shiftEdges: number[] = []
  for (let t = Math.ceil(start / 60) * 60; t <= end; t += 60) if ([7, 15, 23].includes((t % 1440) / 60)) shiftEdges.push(t)
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex items-center gap-4 rounded-xl border border-line-strong bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur">
      <button type="button" onClick={onNext} disabled={busy} aria-keyshortcuts="n" className="btn btn-primary shrink-0 gap-2.5 px-4">
        Next entry
        <kbd className="rounded border border-white/40 px-1 font-mono text-[11px] font-medium">N</kbd>
      </button>
      <div className="relative h-8 min-w-0 flex-1" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-sunken" />
        <div className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-accent/50" style={{ width: pct(now) }} />
        {shiftEdges.map((t) => (
          <span key={t} className="absolute top-1 h-6 w-px bg-line-strong" style={{ left: pct(t) }} />
        ))}
        {events.map((e) => (
          <span key={e.id} className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/70" style={{ left: pct(e.t) }} />
        ))}
        {decisions.map((d) => (
          <span key={d.id} className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink" style={{ left: pct(d.t) }} />
        ))}
        <span className="absolute top-0 h-8 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pct(now) }} />
      </div>
      <div className="hidden shrink-0 text-right text-[12px] leading-tight sm:block">
        <b className="block font-mono text-[13px] text-ink tabular-nums">{view.now?.label ?? ''}</b>
        <span className="text-ink-3">{events.length} entries</span>
      </div>
    </div>
  )
}
