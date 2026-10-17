'use client'

import { Fragment } from 'react'
import { when } from '@/lib/format'
import type { ClinicalEvent, EvidenceLink, Gap, SourceRecord, ThreadStep } from '@/lib/types'

const ROLE_COLOR: Record<ThreadStep['role'], string> = {
  signal: 'var(--color-persistent)',
  recurrence: 'var(--color-persistent)',
  response: 'var(--color-watching)',
  plan: 'var(--color-ink-3)',
  outcome: 'var(--color-verified)',
  contradiction: 'var(--color-ambiguous)',
  context: 'var(--color-line-soft)',
}

const REL_TEXT: Record<EvidenceLink['relationship'], string> = {
  responds_to: 'responds to',
  follows_up: 'follows up',
  recurs: 'recurs after',
  contradicts: 'contradicts',
  plans_for: 'plans for',
  duplicates: 'duplicates',
  relays: 'relays',
}

const SOURCE_TEXT: Record<ClinicalEvent['source_type'], string> = {
  fluid_round: 'Fluid round',
  mobility_check: 'Mobility check',
  progress_note: 'Progress note',
  verification: 'Bedside check',
}

const EXTRACTOR_TEXT: Record<ClinicalEvent['extractor'], string> = {
  structured: 'measured value',
  context_rules: 'read by ConText rules',
  keyword: 'keyword reader',
  llm: 'read by language model',
  human: 'entered at the bedside',
}

const FLAG_TEXT: Record<string, string> = {
  late_entry: 'Late entry',
  duplicate_import: 'Re-import',
  approximate: 'Approximate',
  reported_by_other: 'Reported second-hand',
  historical: 'Earlier shift',
  hedged: 'Hedged',
  qualitative: 'No amount',
  time_from_text: 'Time from text',
}

/** Day/evening/night shift instance, matching engine/thread_engine/clock.py. */
function shiftOf(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const name = h >= 7 && h < 15 ? 'day' : h >= 15 && h < 23 ? 'evening' : 'night'
  const start = new Date(d)
  if (name === 'night' && h < 7) start.setDate(start.getDate() - 1)
  return `${start.toLocaleDateString('en-CA', { weekday: 'long' })} ${name}`
}

function Knot({ role, label }: { role: ThreadStep['role']; label: string }) {
  const c = ROLE_COLOR[role]
  const common = { stroke: 'var(--color-ink)', strokeWidth: 2 }
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" className="relative z-10">
      {role === 'response' ? (
        <rect x="6" y="6" width="18" height="18" rx="3" fill={c} {...common} />
      ) : role === 'plan' ? (
        <circle cx="15" cy="15" r="9" fill="var(--color-paper)" {...common} strokeDasharray="3 2.6" />
      ) : role === 'outcome' ? (
        <>
          <circle cx="15" cy="15" r="10" fill={c} {...common} />
          <path d="M10 15.5l3.5 3.5 6.5-7.5" stroke="white" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      ) : role === 'contradiction' ? (
        <path d="M15 4 26 15 15 26 4 15Z" fill={c} {...common} />
      ) : role === 'recurrence' ? (
        <>
          <circle cx="15" cy="15" r="11" fill="var(--color-paper)" {...common} />
          <circle cx="15" cy="15" r="6" fill={c} {...common} />
        </>
      ) : role === 'signal' ? (
        <circle cx="15" cy="15" r="9" fill={c} {...common} />
      ) : (
        <circle cx="15" cy="15" r="5" fill="var(--color-fill-2)" stroke="var(--color-ink-3)" strokeWidth="1.6" />
      )}
      <title>{label}</title>
    </svg>
  )
}

/** The literal thread: solid where evidence connects, frayed where the records go quiet. */
function Strand({ frayed, last }: { frayed: boolean; last: boolean }) {
  if (last) return null
  return (
    <svg className="absolute top-[30px] left-[14px] h-[calc(100%-14px)] w-[6px] overflow-visible" preserveAspectRatio="none" viewBox="0 0 6 100" aria-hidden="true">
      <path
        d="M3 0 C 6 25, 0 50, 3 75 S 4 95, 3 100"
        fill="none"
        stroke={frayed ? 'var(--color-persistent)' : 'var(--color-ink)'}
        strokeWidth="2.4"
        strokeDasharray={frayed ? '5 6' : undefined}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  )
}

function Quote({ text, span }: { text: string; span: { start: number; end: number } }) {
  return (
    <blockquote className="note-paper mt-2">
      {text.slice(0, span.start)}
      <mark className="mark-span text-ink">{text.slice(span.start, span.end)}</mark>
      {text.slice(span.end)}
    </blockquote>
  )
}

export interface LineProps {
  events: ClinicalEvent[]
  steps: ThreadStep[]
  links: EvidenceLink[]
  gaps: Gap[]
  labels: Record<string, string>
  sources: Record<string, SourceRecord>
  focus: Set<string>
  onFocus: (ids: string[]) => void
}

export function ThreadLine({ events, steps, links, gaps, labels, sources, focus, onFocus }: LineProps) {
  const stepOf = Object.fromEntries(steps.map((s) => [s.event_id, s]))
  const out = (id: string) => links.filter((l) => l.source_event_id === id)
  const inGap = (iso: string) => gaps.some((g) => iso > g.start && iso <= g.end)
  // Draw each gap after the last event at or before its start, so same-minute events stay together.
  const gapAt = new Map<number, Gap>()
  for (const g of gaps) {
    let idx = 0
    events.forEach((e, i) => {
      if (e.event_time <= g.start) idx = i
    })
    gapAt.set(idx, g)
  }
  const shifts = events.map((e) => shiftOf(e.event_time))

  return (
    <ol className="relative" aria-label="Concern thread, oldest first">
      {events.map((e, i) => {
        const step = stepOf[e.event_id]
        const role = step?.role ?? 'context'
        const shift = shifts[i] ?? ''
        const header = i === 0 || shift !== shifts[i - 1]
        const next = events[i + 1]
        const frayed = next ? inGap(next.event_time) : false
        const gap = gapAt.get(i)
        const src = sources[e.source_id]
        const label = labels[e.event_id]
        const muted = role === 'context' || !!e.duplicate_of
        const lit = focus.has(e.event_id)
        return (
          <Fragment key={e.event_id}>
            {header && (
              <li className="relative mb-3 flex items-center gap-3 pl-11" aria-label={`${shift} shift`}>
                <span className="label whitespace-nowrap">{shift} shift</span>
                <span className="h-0 flex-1 border-t-2 border-dashed border-line-soft" />
              </li>
            )}
            <li
              id={`ev-${label}`}
              className="relative grid grid-cols-[30px_minmax(0,1fr)] gap-3 pb-5"
            >
              <div className="relative">
                <Knot role={role} label={step?.label ?? 'Context'} />
                <Strand frayed={frayed || !!gap} last={i === events.length - 1} />
              </div>
              <article
                className={`panel scroll-mt-24 p-3.5 transition-colors sm:p-4 ${muted ? 'opacity-80' : ''}`}
                style={{ background: lit ? 'var(--color-sticky)' : muted ? 'var(--color-paper)' : undefined, ['--sketch-color' as string]: muted ? 'var(--color-line-soft)' : undefined }}
              >
                <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="rounded bg-ink px-1.5 text-[13px] font-bold text-paper">{label}</span>
                  <time className="font-bold" dateTime={e.event_time}>
                    {when(e.event_time)}
                  </time>
                  <span className="text-[13.5px] text-ink-2">
                    {SOURCE_TEXT[e.source_type]} · {e.author}
                  </span>
                  {step && (
                    <span className="chip ml-auto" style={{ color: ROLE_COLOR[role] === 'var(--color-line-soft)' ? 'var(--color-ink-3)' : ROLE_COLOR[role] }}>
                      {step.label}
                    </span>
                  )}
                </header>

                <p className="mt-1.5 font-bold">{e.summary}</p>
                {src?.text && e.span ? <Quote text={src.text} span={e.span} /> : null}
                {step && <p className="mt-2 text-[14px] text-ink-2">{step.note}</p>}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.flags
                    .filter((f) => FLAG_TEXT[f])
                    .map((f) => (
                      <span key={f} className="tag" style={f === 'late_entry' ? { borderColor: 'var(--color-persistent)', color: 'var(--color-persistent)' } : undefined}>
                        {FLAG_TEXT[f]}
                        {f === 'late_entry' && ` · entered ${when(e.recorded_at)}`}
                      </span>
                    ))}
                </div>

                {e.extractor !== 'structured' && e.extractor !== 'human' && (
                  <details className="mt-2 text-[13.5px]">
                    <summary className="cursor-pointer text-ink-2">
                      Why it was read this way · {EXTRACTOR_TEXT[e.extractor]} · reading confidence {e.confidence.toFixed(2)}
                    </summary>
                    <ul className="mt-1 list-disc pl-5 text-ink-2">
                      {e.triggers.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                      <li>Reading confidence is how sure the extractor is about the sentence, not a clinical probability.</li>
                    </ul>
                  </details>
                )}

                {out(e.event_id).map((l) => (
                  <p key={`${l.relationship}-${l.target_event_id}`} className="mt-2 text-[13.5px]">
                    <a
                      href={`#ev-${labels[l.target_event_id]}`}
                      className="font-bold underline decoration-2 underline-offset-2"
                      onMouseEnter={() => onFocus([l.target_event_id, e.event_id])}
                      onMouseLeave={() => onFocus([])}
                      style={{ color: l.relationship === 'contradicts' ? 'var(--color-ambiguous)' : undefined }}
                    >
                      ↳ {REL_TEXT[l.relationship]} {labels[l.target_event_id]}
                    </a>{' '}
                    <span className="text-ink-2">
                      {l.evidence_text} <span className="text-ink-3">(link {l.confidence.toFixed(2)})</span>
                    </span>
                  </p>
                ))}
              </article>
            </li>
            {gap && (
              <li className="relative grid grid-cols-[30px_minmax(0,1fr)] gap-3 pb-5" aria-label="Evidence gap">
                <div className="relative">
                  <svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true">
                    <path d="M8 4 L 22 22 M22 4 L 8 22" stroke="var(--color-persistent)" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                  <Strand frayed last={false} />
                </div>
                <div className="sticky-note -rotate-[0.4deg] border-2 border-dashed border-persistent bg-persistent-soft text-[14.5px]" style={{ background: 'var(--color-persistent-soft)' }}>
                  <p className="font-bold" style={{ color: 'var(--color-persistent)' }}>
                    Evidence gap · {when(gap.start)} → {when(gap.end)}
                  </p>
                  <p>{gap.description}</p>
                </div>
              </li>
            )}
          </Fragment>
        )
      })}
    </ol>
  )
}
