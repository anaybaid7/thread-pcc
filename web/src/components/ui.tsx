'use client'

import { AREAS, clock, MEASURES, resident, type Area, type Event, type Status, type Ward } from '@thread/engine'
import type { ReactNode } from 'react'

export function AreaIcon({ area, size = 18 }: { area: Area; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0 text-ink-2">
      {area === 'mobility' && (
        <>
          <path d="M6 4h6l2 9M8 4l-2 9" {...p} />
          <circle cx="6" cy="15.5" r="1.8" {...p} />
          <circle cx="14.5" cy="15.5" r="1.8" {...p} />
        </>
      )}
      {area === 'eating' && <path d="M3 10h14a7 6 0 0 1-14 0zM13 3l-3 7" {...p} />}
      {area === 'drinking' && <path d="M5 4h10l-1.2 12H6.2zM5.6 9h8.8" {...p} />}
      {area === 'mood' && <path d="M4 5h12v8H9l-4 3v-3H4zM7 9h6" {...p} />}
      {area === 'thinking' && <path d="M3.5 4.5h13v12h-13zM3.5 8.5h13M7 3v3M13 3v3" {...p} />}
      {area === 'sleep' && <path d="M14 13.5A6 6 0 0 1 7.5 4a6 6 0 1 0 6.5 9.5z" {...p} />}
      {area === 'pain' && <path d="M11 3 6 11h4l-1 6 5-8h-4z" {...p} />}
      {area === 'breathing' && <path d="M3 8h9a2.5 2.5 0 1 0-2.5-2.5M3 12h12a2.5 2.5 0 1 1-2.5 2.5" {...p} />}
    </svg>
  )
}

const STATUS: Record<Status | 'offers', { label: string; cls: string }> = {
  new: { label: 'Not yet seen', cls: 'border-poor/40 bg-poor-soft text-poor' },
  watching: { label: 'Watching', cls: 'border-accent/40 bg-accent-soft text-accent-strong' },
  escalated: { label: 'Escalated', cls: 'border-mid/40 bg-mid-soft text-mid' },
  resolved: { label: 'Closed', cls: 'border-good/40 bg-good-soft text-good' },
  offers: { label: 'No outcome', cls: 'border-mid/40 bg-mid-soft text-mid' },
}

export function StatusPill({ status, overdue }: { status: Status | 'offers'; overdue?: boolean }) {
  if (overdue) return <span className="chip border-poor/50 bg-poor text-white">Recheck overdue</span>
  const s = STATUS[status]
  return <span className={`chip ${s.cls}`}>{s.label}</span>
}

/** The steps of a workflow, with the current one highlighted. Done is derived from the ward, not from clicks. */
export function Guide({ title, who, steps }: { title: string; who: string; steps: { label: string; done: boolean }[] }) {
  const current = steps.findIndex((s) => !s.done)
  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="min-w-[180px]">
        <p className="eyebrow">{who}</p>
        <h1 className="text-[22px] leading-tight">{title}</h1>
      </div>
      <ol className="flex flex-1 flex-wrap gap-2" aria-label="Steps">
        {steps.map((s, i) => (
          <li
            key={s.label}
            aria-current={i === current ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] ${
              s.done ? 'border-good/30 bg-good-soft text-good' : i === current ? 'border-ink bg-ink text-white' : 'border-line text-ink-3'
            }`}
          >
            <span className="font-mono text-[11.5px]">{s.done ? '✓' : i + 1}</span>
            {s.label}
          </li>
        ))}
        {current === -1 && <li className="self-center text-[13px] font-semibold text-good">Done</li>}
      </ol>
    </div>
  )
}

export function Panel({ title, aside, children, className = '' }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[17px]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** The last 24 hours for one resident: every recorded event on a single line, coloured by what it says. */
export function DayStrip({ ward, residentId }: { ward: Ward; residentId: string }) {
  const end = ward.now
  const start = end - 1440
  const W = 640
  const x = (t: number) => 8 + ((t - start) / (end - start)) * (W - 16)
  const concernIds = new Set(ward.events.filter((e) => (e.type === 'report' || e.type === 'open') && e.residentId === residentId).map((e) => e.id))
  const mine = ward.events.filter(
    (e) => e.at >= start && ('residentId' in e ? e.residentId === residentId : e.type === 'plan' || e.type === 'resolve' ? concernIds.has(e.concernId) : false),
  )
  const r = resident(residentId)
  const mark = (e: Event) => {
    const cx = x(e.at)
    if (e.type === 'observe') return <circle cx={cx} cy={20} r={5} fill={e.usual ? 'var(--color-good)' : 'var(--color-poor)'} />
    if (e.type === 'report') return <rect x={cx - 5} y={15} width={10} height={10} transform={`rotate(45 ${cx} 20)`} fill="var(--color-ink)" />
    if (e.type === 'offer') return <circle cx={cx} cy={20} r={5} fill="var(--color-surface)" stroke="var(--color-mid)" strokeWidth={2} strokeDasharray="2 2" />
    if (e.type === 'measure') return <rect x={cx - 4.5} y={15.5} width={9} height={9} rx={1.5} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2} />
    if (e.type === 'plan') return <path d={`M${cx - 5} 25 L${cx} 15 L${cx + 5} 25 Z`} fill="var(--color-accent)" />
    if (e.type === 'resolve') return <path d={`M${cx - 5} 20 l3.5 3.5 6.5-7`} stroke="var(--color-good)" strokeWidth={2.5} fill="none" />
    return null
  }
  const label = (e: Event) =>
    e.type === 'observe'
      ? `${AREAS[e.area].label}: ${e.finding}`
      : e.type === 'measure'
        ? `${MEASURES[e.kind].label}: ${e.value}`
        : e.type === 'offer'
          ? e.what
          : e.type === 'report'
            ? 'Reported to the nurse'
            : e.type === 'plan'
              ? e.decision === 'watch'
                ? 'Watch plan'
                : 'Escalated'
              : 'Closed'
  return (
    <div className="overflow-x-auto">
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a static SVG strip with a text alternative */}
      <svg viewBox={`0 0 ${W} 44`} className="h-11 w-full min-w-[420px]" role="img" aria-label={`${r.preferred}, last 24 hours: ${mine.length} recorded events`}>
        {[0, 6, 12, 18, 24].map((h) => (
          <g key={h}>
            <line x1={x(start + h * 60)} x2={x(start + h * 60)} y1={8} y2={30} stroke="var(--color-line)" />
            <text x={x(start + h * 60)} y={42} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)" fontFamily="ui-monospace, Menlo, monospace">
              {h === 24 ? 'now' : clock(start + h * 60)}
            </text>
          </g>
        ))}
        <line x1={8} x2={W - 8} y1={20} y2={20} stroke="var(--color-line-strong)" />
        {mine.map((e) => (
          <g key={e.id}>
            {mark(e)}
            <title>{`${clock(e.at)} · ${label(e)}`}</title>
          </g>
        ))}
      </svg>
    </div>
  )
}
