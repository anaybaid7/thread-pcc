'use client'

import type { Debrief } from '@thread/engine'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { Ring, toneOf } from '../motion'
import { ScoreLineRow } from './DecisionPanel'

const ForkScene = dynamic(() => import('../three/ForkScene'), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-xl bg-sunken/60" /> })

const SHORT: Record<string, string> = {
  recognition: 'Noticed',
  communication: 'Acted',
  evidence: 'Fact vs. guess',
  handover: 'Handover',
}

type Tab = 'changed' | 'unknown' | 'slips' | 'choices'

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
  const [open, setOpen] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('choices')
  const other = debrief.otherCourses[0]
  const forked = debrief.course.id === 'persist' || debrief.course.id === 'resolve'
  const tone = toneOf(debrief.total, debrief.max)
  const crit = debrief.criteria.find((c) => c.key === open)

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'choices', label: 'Other choices', count: debrief.alternatives.length },
    { id: 'changed', label: 'What changed', count: debrief.deviations.length },
    { id: 'unknown', label: 'Not known', count: debrief.missing.length },
    { id: 'slips', label: 'Guesses as facts', count: debrief.slips.length },
  ]

  return (
    <section className="space-y-5" aria-labelledby="debrief-title">
      <div className="card flip-in overflow-hidden">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[auto_1fr]">
          <div className="flex items-center gap-5">
            <Ring value={debrief.total} max={debrief.max} size={128} stroke={11} />
            <div>
              <p className="eyebrow">Debrief</p>
              <h2 id="debrief-title" className="mt-1 text-[28px]" style={{ color: `var(--color-${tone})` }}>
                {tone === 'good' ? 'Clear and grounded.' : tone === 'mid' ? 'Good instincts, some gaps.' : 'Worth another go.'}
              </h2>
              <p className="mt-1 text-[14px] text-ink-2">Every score used only what you knew at the time.</p>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:self-center">
            {debrief.criteria.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => setOpen(open === c.key ? null : c.key)}
                  aria-pressed={open === c.key}
                  className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 p-2.5 transition-all hover:-translate-y-0.5 hover:shadow-md ${open === c.key ? 'border-accent bg-accent-soft' : 'border-line'}`}
                >
                  <Ring value={c.earned} max={c.max} size={62} stroke={7} label={`${SHORT[c.key]}: ${c.earned} of ${c.max}`} />
                  <span className="text-[12.5px] font-semibold">{SHORT[c.key]}</span>
                  <span className="text-[11.5px] text-ink-3 tabular-nums">
                    {c.earned}/{c.max}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {crit && (
          <div className="pop border-t border-line bg-sunken/40 p-4 sm:px-6">
            <p className="text-[13px] text-ink-3">{crit.about}</p>
            <ul className="mt-2 grid gap-2 md:grid-cols-2">
              {crit.lines.map((l) => (
                <ScoreLineRow key={l.item} {...l} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {forked && other && (
        <div className="card overflow-hidden">
          <div className="grid lg:grid-cols-[1.2fr_1fr]">
            <div className="h-[230px] bg-gradient-to-b from-surface to-sunken/50 sm:h-[260px]">
              <ForkScene taken={debrief.course.id as 'persist' | 'resolve'} />
            </div>
            <div className="flex flex-col justify-center gap-3 p-5 sm:p-6">
              <p className="eyebrow">This run</p>
              <p className="font-serif text-[20px] leading-snug">{debrief.course.summary}</p>
              <p className="text-[14px] text-ink-2">Same Monday choice in the other version = same score. Try it.</p>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary btn-lg" onClick={() => onReplay('other')} disabled={busy}>
                  Play the other version
                </button>
                <button className="btn btn-lg" onClick={() => onReplay('same')} disabled={busy}>
                  Replay
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Debrief details</legend>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${tab === t.id ? 'bg-ink text-white' : 'bg-sunken text-ink-2 hover:bg-line'}`}
            >
              {t.label} <span className="ml-0.5 opacity-60 tabular-nums">{t.count}</span>
            </button>
          ))}
        </fieldset>
        <div key={tab} className="slide-in mt-4">
          {tab === 'choices' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {debrief.alternatives.map((a) => (
                <div key={a.title}>
                  <p className="text-[13.5px] font-semibold text-ink-3">{a.title.split('.')[0]}</p>
                  <ul className="mt-2 space-y-1.5">
                    {a.options.map((o) => {
                      const t = toneOf(o.earned, o.max)
                      return (
                        <li key={o.label}>
                          <details className={`group rounded-lg border ${o.chosen ? 'border-ink' : 'border-line'}`}>
                            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
                              <span className="h-2 shrink-0 rounded-full" style={{ width: `${Math.max(8, (o.earned / o.max) * 48)}px`, background: `var(--color-${t})` }} aria-hidden="true" />
                              <span className="flex-1 text-[13.5px] font-medium">
                                {o.chosen && <span className="mr-1.5 rounded bg-ink px-1.5 py-px text-[10.5px] text-white">YOU</span>}
                                {o.label}
                              </span>
                              <span className="text-[12.5px] font-bold tabular-nums" style={{ color: `var(--color-${t})` }}>
                                {o.earned}/{o.max}
                              </span>
                            </summary>
                            <p className="px-3 pb-2.5 text-[13px] text-ink-2">{o.feedback}</p>
                          </details>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {tab === 'changed' && <Bullets items={debrief.deviations} empty={`Nothing below ${name}’s usual came up.`} color="var(--color-intake)" />}
          {tab === 'unknown' && <Bullets items={debrief.missing} empty="Nothing was flagged unknown." color="var(--color-unknown)" dashed />}
          {tab === 'slips' && <Bullets items={debrief.slips} empty="None. Facts stayed facts." color="var(--color-poor)" />}
        </div>
      </div>

      <p className="px-1 text-center font-serif text-[18px] text-ink-2 italic">“{debrief.insight}”</p>
      {!forked && (
        <div className="flex justify-center">
          <button className="btn btn-primary btn-lg" onClick={() => onReplay('same')} disabled={busy}>
            Play again
          </button>
        </div>
      )}
    </section>
  )
}

function Bullets({ items, empty, color, dashed }: { items: string[]; empty: string; color: string; dashed?: boolean }) {
  if (!items.length) return <p className="text-[14px] text-ink-3">{empty}</p>
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {items.map((x) => (
        <li key={x} className={`flex gap-2.5 rounded-lg border px-3 py-2 text-[13.5px] ${dashed ? 'border-dashed' : ''}`} style={{ borderColor: color }}>
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
          <span className="text-ink-2">{x}</span>
        </li>
      ))}
    </ul>
  )
}
