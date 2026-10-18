'use client'

import type { AttemptView, EventKind, TimelineItem } from '@thread/engine'
import { useEffect, useRef, useState } from 'react'
import { toneOf } from '../motion'

export const KIND: Record<EventKind, { label: string; color: string }> = {
  observation: { label: 'Seen', color: 'var(--color-observation)' },
  documentation: { label: 'Charted', color: 'var(--color-documentation)' },
  action: { label: 'Done', color: 'var(--color-action)' },
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
    <li className={`relative flex gap-3 pb-3 ${fresh ? 'flip-in' : ''}`}>
      <div className="relative z-10 pt-2">
        <KindMark kind={item.kind} />
      </div>
      <div
        className={`min-w-0 flex-1 rounded-xl border transition-shadow ${unknown ? 'border-dashed border-unknown/50 bg-[#fbf6f0]' : 'border-line bg-surface'} ${fresh ? 'shadow-[0_8px_24px_-12px_rgb(14_90_97/0.45)] ring-2 ring-accent/25' : ''}`}
      >
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-start gap-2 px-3 py-2 text-left">
          <span className="mt-px shrink-0 rounded-md bg-sunken px-1.5 py-0.5 text-[12px] font-bold text-ink tabular-nums">
            {item.day.slice(0, 3)} {item.clock}
          </span>
          <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-medium">{item.fact}</span>
          <span aria-hidden="true" className={`mt-0.5 text-[11px] text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▸
          </span>
        </button>
        {item.quote && (
          <p className="relative mx-3 mb-2.5 inline-block rounded-2xl rounded-tl-sm bg-accent-soft px-3 py-1.5 font-serif text-[15px] text-accent-strong italic">“{item.quote}”</p>
        )}
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
    <li className={`relative flex gap-3 pb-3 ${fresh ? 'flip-in' : ''}`}>
      <div className="relative z-10 grid size-6 shrink-0 rotate-45 place-items-center rounded-[5px] bg-ink" aria-hidden="true" style={{ marginTop: 10 }} />
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border-2 border-ink/85 bg-surface px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold tracking-wide text-ink-3 uppercase">
            {item.day.slice(0, 3)} {item.clock} · you decided
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
          Timeline
        </h2>
        <KindLegend />
      </div>
      {count === 0 ? (
        <p className="mt-4 grid place-items-center rounded-xl border border-dashed border-line-strong py-8 text-[14px] text-ink-3">Nothing yet. Draw the first event.</p>
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

/** The deck of events still to come. Drawing reveals exactly one. */
export function EventDeck({ onDraw, busy, count, disabled }: { onDraw: () => void; busy: boolean; count: number; disabled?: boolean }) {
  const [drawing, setDrawing] = useState(false)
  const draw = () => {
    if (busy || disabled) return
    setDrawing(true)
    onDraw()
    window.setTimeout(() => setDrawing(false), 450)
  }
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex items-center gap-4 rounded-2xl border border-line-strong bg-surface/95 p-3 pr-4 shadow-xl backdrop-blur">
      <div className={`deck ${drawing ? 'is-drawing' : ''}`}>
        <button
          type="button"
          onClick={draw}
          disabled={busy || disabled}
          aria-keyshortcuts="n"
          aria-label="Draw next event"
          className="deck-card grid h-[64px] w-[104px] place-items-center rounded-[14px] text-[15px] font-semibold text-white shadow-lg disabled:opacity-60"
        >
          <span className="flex items-center gap-1.5">
            Next <span aria-hidden="true">→</span>
          </span>
        </button>
      </div>
      <div className="min-w-0 text-[13px] leading-tight">
        <b className="block text-[14px] text-ink">Draw the next event</b>
        <span className="text-ink-3">
          {count} so far · press <kbd className="rounded border border-line-strong px-1 text-[11px]">N</kbd>
        </span>
      </div>
    </div>
  )
}
