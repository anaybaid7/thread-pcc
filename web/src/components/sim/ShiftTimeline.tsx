'use client'

import type { AttemptView, EventKind, TimelineItem } from '@thread/engine'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { KIND } from './EventTimeline'

/**
 * The shift as a swimlane chart. Rows are the people (and the chart) around the resident; x is clock time across
 * day, evening and night shifts. Marks are entries, bars show who knew of the change, arrows are hand-offs (broken
 * where information was not passed on), hatching shows long stretches with no entries and time not yet reached.
 * Drag the cursor back to see what was known at any moment; pick a decision to see the evidence it was judged on.
 */

const ROW = 36
const AXIS = 44
const LEFT = 136
const RIGHT = 18
const FOOT = 18
const GAP_MIN = 240

const SHIFTS = [
  { name: 'Day', from: 7 * 60, to: 15 * 60, fill: 'transparent' },
  { name: 'Evening', from: 15 * 60, to: 23 * 60, fill: 'var(--color-sunken)' },
  { name: 'Night', from: 23 * 60, to: 31 * 60, fill: 'rgb(22 33 43 / 0.07)' },
]

const fmt = (t: number, days: string[]) => {
  const d = Math.floor(t / 1440)
  const m = ((t % 1440) + 1440) % 1440
  return `${(days[d] ?? `Day ${d + 1}`).slice(0, 3)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function Mark({ kind, x, y, dim, ring }: { kind: EventKind; x: number; y: number; dim: boolean; ring: boolean }) {
  const c = KIND[kind].color
  const o = dim ? 0.18 : 1
  return (
    <g opacity={o}>
      {ring && <circle cx={x} cy={y} r={10} fill="none" stroke="var(--color-accent)" strokeWidth={2} />}
      {kind === 'observation' && <circle cx={x} cy={y} r={5.5} fill={c} />}
      {kind === 'documentation' && <rect x={x - 5} y={y - 5} width={10} height={10} rx={1.5} fill="var(--color-surface)" stroke={c} strokeWidth={2} />}
      {kind === 'action' && <path d={`M${x - 6} ${y + 5} L${x} ${y - 6} L${x + 6} ${y + 5} Z`} fill={c} />}
      {kind === 'unknown' && <circle cx={x} cy={y} r={5.5} fill="var(--color-surface)" stroke={c} strokeWidth={1.8} strokeDasharray="2.5 2" />}
    </g>
  )
}

export function ShiftTimeline({
  view,
  asOf,
  onAsOf,
  focus,
  onFocus,
  flowsOn = true,
}: {
  view: AttemptView
  asOf: number | null
  onAsOf: (t: number | null) => void
  focus: string | null
  onFocus: (decisionId: string | null) => void
  flowsOn?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<{ x: number; y: number; item: Extract<TimelineItem, { type: 'event' }> } | null>(null)
  const drag = useRef(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const { start, end, days } = view.window
  const now = view.window.now ?? start
  const W = Math.max(width, 660)
  const plot = W - LEFT - RIGHT
  const x = (t: number) => LEFT + ((Math.min(Math.max(t, start), end) - start) / (end - start)) * plot
  const tOf = (px: number) => start + ((px - LEFT) / plot) * (end - start)
  const rows = view.people
  const rowIdx = new Map(rows.map((p, i) => [p.id, i]))
  const y = (id: string) => AXIS + (rowIdx.get(id) ?? rows.length - 1) * ROW + ROW / 2
  const H = AXIS + rows.length * ROW + FOOT
  const cursor = asOf ?? now
  const events = view.timeline.filter((t): t is Extract<TimelineItem, { type: 'event' }> => t.type === 'event')
  const decisions = view.timeline.filter((t): t is Extract<TimelineItem, { type: 'decision' }> => t.type === 'decision')
  const focused = decisions.find((d) => d.id === focus)
  const evidence = focused ? new Set(focused.evidence) : null

  // Shift bands across the window.
  const bands: { x1: number; x2: number; label: string; fill: string }[] = []
  for (let d = -1; d <= Math.ceil(end / 1440); d++)
    for (const s of SHIFTS) {
      const a = d * 1440 + s.from
      const b = d * 1440 + s.to
      if (b <= start || a >= end) continue
      bands.push({ x1: x(Math.max(a, start)), x2: x(Math.min(b, end)), label: `${(days[d] ?? '').slice(0, 3)} ${s.name.toLowerCase()}`, fill: s.fill })
    }

  // Hours: every 2h, or 4h when space is tight.
  const step = plot / ((end - start) / 60) < 18 ? 240 : 120
  const ticks: number[] = []
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) ticks.push(t)

  // Long stretches with no entries, up to now.
  const sorted = [...events].sort((a, b) => a.t - b.t)
  const gaps: { a: number; b: number }[] = []
  for (let i = 1; i < sorted.length; i++) if (sorted[i]!.t - sorted[i - 1]!.t >= GAP_MIN) gaps.push({ a: sorted[i - 1]!.t, b: sorted[i]!.t })

  // Offset marks that land on the same row at nearly the same time.
  const placed: { item: Extract<TimelineItem, { type: 'event' }>; px: number; py: number }[] = []
  for (const it of sorted) {
    let px = x(it.t)
    const py = y(it.by)
    while (placed.some((p) => p.py === py && Math.abs(p.px - px) < 9)) px += 9
    placed.push({ item: it, px, py })
  }

  const knewAt = (t: number) => rows.filter((p) => p.since != null && p.since <= t)
  const setFromPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const t = Math.round(tOf(((e.clientX - r.left) / r.width) * W) / 5) * 5
    const clamped = Math.max(start, Math.min(now, t))
    onAsOf(clamped >= now ? null : clamped)
  }

  return (
    <div>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG: a region that scrolls must be reachable by keyboard */}
      <section ref={box} className="relative overflow-x-auto" tabIndex={0} aria-label="Shift timeline, scrolls sideways">
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          className="block touch-pan-y select-none"
          aria-hidden="true"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            if (e.clientY - r.top > AXIS) return
            drag.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            setFromPointer(e)
          }}
          onPointerMove={(e) => drag.current && setFromPointer(e)}
          onPointerUp={() => (drag.current = false)}
        >
          <defs>
            <pattern id="st-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-ink)" strokeOpacity="0.09" strokeWidth="2" />
            </pattern>
            <marker id="st-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 Z" fill="var(--color-accent)" />
            </marker>
          </defs>

          {/* Shift bands and labels */}
          {bands.map((b) => (
            <g key={b.label + b.x1}>
              <rect x={b.x1} y={AXIS} width={b.x2 - b.x1} height={rows.length * ROW} fill={b.fill} />
              <line x1={b.x1} x2={b.x1} y1={14} y2={AXIS + rows.length * ROW} stroke="var(--color-line-strong)" />
              {b.x2 - b.x1 > 70 && (
                <text x={b.x1 + 6} y={18} fontSize="11.5" fontWeight="600" fill="var(--color-ink-2)">
                  {b.label}
                </text>
              )}
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={AXIS - 6} y2={AXIS} stroke="var(--color-line-strong)" />
              <text x={x(t)} y={AXIS - 10} fontSize="10.5" textAnchor="middle" fill="var(--color-ink-3)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                {String(Math.floor((t % 1440) / 60)).padStart(2, '0')}
              </text>
            </g>
          ))}

          {/* Rows */}
          {rows.map((p, i) => (
            <g key={p.id}>
              <line x1={8} x2={W - RIGHT} y1={AXIS + (i + 1) * ROW} y2={AXIS + (i + 1) * ROW} stroke="var(--color-line)" />
              <text x={10} y={AXIS + i * ROW + 16} fontSize="12.5" fontWeight="600" fill="var(--color-ink)">
                {p.label}
              </text>
              <text x={10} y={AXIS + i * ROW + 29} fontSize="10.5" fill="var(--color-ink-3)">
                {p.role}
              </text>
              {flowsOn && p.since != null && p.since <= cursor && (
                <rect x={x(p.since)} y={y(p.id) - 4} width={Math.max(2, x(cursor) - x(p.since))} height={8} rx={4} fill="var(--color-accent)" opacity={0.18} />
              )}
            </g>
          ))}

          {/* No entries for a long stretch */}
          {gaps.map((g) => (
            <g key={g.a}>
              <rect x={x(g.a) + 6} y={AXIS} width={Math.max(0, x(g.b) - x(g.a) - 12)} height={rows.length * ROW} fill="url(#st-hatch)" />
              {x(g.b) - x(g.a) > 90 && (
                <text x={(x(g.a) + x(g.b)) / 2} y={H - 5} textAnchor="middle" fontSize="10.5" fill="var(--color-ink-3)">
                  no entries · {Math.round((g.b - g.a) / 60)}h
                </text>
              )}
            </g>
          ))}

          {/* Not yet reached */}
          {now < end && (
            <g>
              <rect x={x(now)} y={AXIS} width={x(end) - x(now)} height={rows.length * ROW} fill="var(--color-surface)" opacity={0.75} />
              <rect x={x(now)} y={AXIS} width={x(end) - x(now)} height={rows.length * ROW} fill="url(#st-hatch)" />
              {x(end) - x(now) > 80 && (
                <text x={(x(now) + x(end)) / 2} y={AXIS + (rows.length * ROW) / 2} textAnchor="middle" fontSize="12" fill="var(--color-ink-3)">
                  not yet happened
                </text>
              )}
            </g>
          )}

          {/* Hand-offs */}
          {flowsOn &&
            view.flows.map((f, i) => {
              if (!rowIdx.has(f.from) || !rowIdx.has(f.to)) return null
              const fx = x(f.t) + 4 + (i % 3) * 3
              const y1 = y(f.from)
              const y2 = y(f.to) + (y(f.to) > y1 ? -7 : 7)
              const dim = f.t > cursor
              return (
                <g key={`${f.eventId}-${i}`} opacity={dim ? 0.15 : 1}>
                  <path
                    d={`M${fx} ${y1} C ${fx + 14} ${y1}, ${fx + 14} ${y2}, ${fx} ${y2}`}
                    fill="none"
                    stroke={f.passed ? 'var(--color-accent)' : 'var(--color-poor)'}
                    strokeWidth={1.6}
                    strokeDasharray={f.passed ? undefined : '4 3'}
                    markerEnd={f.passed ? 'url(#st-arrow)' : undefined}
                  >
                    <title>{`${fmt(f.t, days)} · ${f.note}`}</title>
                  </path>
                  {!f.passed && (
                    <path d={`M${fx - 4} ${y2 - 4} l8 8 M${fx + 4} ${y2 - 4} l-8 8`} stroke="var(--color-poor)" strokeWidth={1.8} />
                  )}
                </g>
              )
            })}

          {/* Decisions */}
          {decisions.map((d, i) => {
            const on = focus === d.id
            return (
              <g key={d.id} className="cursor-pointer" onClick={() => (on ? (onFocus(null), onAsOf(null)) : (onFocus(d.id), onAsOf(d.t)))}>
                <line x1={x(d.t)} x2={x(d.t)} y1={AXIS} y2={AXIS + rows.length * ROW} stroke="var(--color-ink)" strokeDasharray="2 3" opacity={on ? 0.9 : 0.45} />
                <rect x={x(d.t) - 22} y={AXIS + 2} width={44} height={16} rx={3} fill={on ? 'var(--color-ink)' : 'var(--color-surface)'} stroke="var(--color-ink)" />
                <text x={x(d.t)} y={AXIS + 13.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={on ? 'var(--color-surface)' : 'var(--color-ink)'}>
                  {`D${i + 1} · ${d.earned}`}
                </text>
                <title>{`${d.title} You chose: ${d.choice}. ${d.earned} of ${d.max}. Click to see the evidence it was judged on.`}</title>
              </g>
            )
          })}

          {/* Entries */}
          {placed.map(({ item, px, py }) => (
            <g
              key={item.id}
              onPointerEnter={() => setHover({ x: px, y: py, item })}
              onPointerLeave={() => setHover(null)}
              className="cursor-default"
            >
              <circle cx={px} cy={py} r={11} fill="transparent" />
              <Mark kind={item.kind} x={px} y={py} dim={item.t > cursor || (!!evidence && !evidence.has(item.id))} ring={!!evidence && evidence.has(item.id)} />
            </g>
          ))}

          {/* Cursor */}
          <g>
            <line x1={x(cursor)} x2={x(cursor)} y1={24} y2={AXIS + rows.length * ROW} stroke="var(--color-ink)" strokeWidth={1.5} />
            <rect x={x(cursor) - 32} y={22} width={64} height={16} rx={8} fill="var(--color-ink)" className="cursor-ew-resize" />
            <text x={x(cursor)} y={33.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="var(--color-surface)" className="pointer-events-none tabular-nums">
              {fmt(cursor, days)}
            </text>
          </g>
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-[260px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg"
            style={{ left: Math.min(hover.x + 12, W - 270), top: hover.y + 14 }}
          >
            <p className="font-semibold">
              {hover.item.day.slice(0, 3)} {hover.item.clock} · <span style={{ color: KIND[hover.item.kind].color }}>{KIND[hover.item.kind].label}</span>
            </p>
            <p className="mt-0.5 text-ink-2">{hover.item.text}</p>
            <p className="mt-1 text-[11.5px] text-ink-3">{hover.item.source}</p>
          </div>
        )}
      </section>

      <p className="sr-only">
        Shift timeline from {fmt(start, days)} to {fmt(end, days)}. {events.length} entries so far. {knewAt(cursor).length} of {rows.length} people knew of the change
        at {fmt(cursor, days)}. The entries are listed in full under Entries.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
        <label className="flex min-w-[260px] flex-1 items-center gap-3">
          <span className="shrink-0 font-semibold text-ink-2">Known at</span>
          <input
            type="range"
            min={start}
            max={now}
            step={5}
            value={cursor}
            onChange={(e) => {
              const t = Number(e.target.value)
              onAsOf(t >= now ? null : t)
            }}
            className="w-full accent-[var(--color-ink)]"
            aria-valuetext={fmt(cursor, days)}
          />
        </label>
        {decisions.map((d, i) => (
          <button
            key={d.id}
            type="button"
            aria-pressed={focus === d.id}
            onClick={() => (focus === d.id ? (onFocus(null), onAsOf(null)) : (onFocus(d.id), onAsOf(d.t)))}
            className={`rounded-md border px-2 py-1 font-mono text-[11.5px] ${focus === d.id ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken'}`}
          >
            D{i + 1} evidence
          </button>
        ))}
        {asOf != null && (
          <button type="button" className="btn px-2.5 py-1 text-[12.5px]" onClick={() => (onAsOf(null), onFocus(null))}>
            Back to now
          </button>
        )}
        <span className="text-ink-2">
          <b className="text-ink tabular-nums">{knewAt(cursor).length}</b> of {rows.length} knew of the change at {fmt(cursor, days)}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-3" aria-label="Key">
        {(Object.keys(KIND) as EventKind[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <Mark kind={k} x={7} y={7} dim={false} ring={false} />
            </svg>
            {KIND[k].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-5 rounded-full bg-accent/20" aria-hidden="true" />
          knew of the change
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="20" y2="5" stroke="var(--color-accent)" strokeWidth="1.6" />
          </svg>
          passed on
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true">
            <line x1="1" y1="5" x2="20" y2="5" stroke="var(--color-poor)" strokeWidth="1.6" strokeDasharray="4 3" />
          </svg>
          not passed on
        </li>
      </ul>
    </div>
  )
}
