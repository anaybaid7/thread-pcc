'use client'

import type { Criterion, DecisionFeedback, DecisionInput, PublicDecision, ScoreLine, Tag } from '@thread/engine'
import { useState } from 'react'
import { toneOf, useCountUp, useTilt } from '../motion'
import { DimIcon, HAS_ICON } from './ResidentCard'
import { SortBoard } from './SortBoard'

export const scoreTone = toneOf

const TREND_ICON: Record<string, { glyph: string; color: string }> = {
  usual: { glyph: '↗', color: 'var(--color-good)' },
  same: { glyph: '→', color: 'var(--color-mid)' },
  more: { glyph: '↘', color: 'var(--color-poor)' },
}

const STEPS = ['What changed?', 'Fact or not?', 'Your move']

function ChoiceCard({ c, on, onPick }: { c: PublicDecision['choices'][number]; on: boolean; onPick: () => void }) {
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLLabelElement>(5)
  return (
    <label
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`tilt grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-xl border-2 p-3.5 ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'}`}
    >
      <input type="radio" name="choice" value={c.id} checked={on} onChange={onPick} className="row-span-2 mt-1 size-4 accent-[var(--color-accent)]" />
      <span className="text-[15px] leading-snug font-semibold">{c.label}</span>
      <span className="mt-0.5 text-[13px] text-ink-2">{c.detail}</span>
    </label>
  )
}

export function DecisionPanel({
  decision,
  evidenceCount,
  busy,
  onSubmit,
}: {
  decision: PublicDecision
  evidenceCount: number
  busy: boolean
  onSubmit: (input: DecisionInput) => void
}) {
  const [step, setStep] = useState(0)
  const [recognition, setRecognition] = useState<string[]>([])
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [choice, setChoice] = useState<string | null>(null)
  const r = decision.recognition
  const done = [recognition.length > 0, decision.statements.every((s) => tags[s.id]), !!choice]
  const toggle = (id: string) => setRecognition((cur) => (r.kind === 'trend' ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <section className="card overflow-hidden border-2 border-accent/60" aria-labelledby="decision-title">
      <div className="bg-gradient-to-r from-accent to-accent-strong px-4 py-3 text-white sm:px-5">
        <p className="text-[12px] font-semibold tracking-wider uppercase opacity-80">Decision · {decision.clock}</p>
        <h2 id="decision-title" className="mt-0.5 text-[21px] text-white">
          {decision.title}
        </h2>
        <ol className="mt-2.5 flex gap-1.5" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                type="button"
                onClick={() => (i <= step || done.slice(0, i).every(Boolean)) && setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={`w-full rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors ${i === step ? 'bg-white text-accent-strong' : done[i] ? 'bg-white/25' : 'bg-white/10 text-white/80'}`}
              >
                {done[i] && i !== step ? '✓ ' : `${i + 1}. `}
                {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <form
        className="p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (done.every(Boolean)) onSubmit({ recognition, tags, choice: choice! })
        }}
      >
        <div key={step} className="slide-in">
          {step === 0 && (
            <fieldset>
              <legend className="mb-3 text-[15px] font-semibold">{r.prompt}</legend>
              <div className={`grid gap-2 ${r.kind === 'trend' ? '' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {r.options.map((o) => {
                  const on = recognition.includes(o.id)
                  const t = TREND_ICON[o.id]
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(o.id)}
                      className={`relative flex items-center gap-2.5 rounded-xl border-2 px-3 py-3 text-left text-[14.5px] font-semibold transition-all ${
                        on ? 'pop border-accent bg-accent-soft text-accent-strong' : 'border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md'
                      }`}
                    >
                      {r.kind === 'trend' && t ? (
                        <span className="grid size-8 place-items-center rounded-full bg-sunken text-[18px]" style={{ color: t.color }} aria-hidden="true">
                          {t.glyph}
                        </span>
                      ) : HAS_ICON.has(o.id) ? (
                        <DimIcon dim={o.id} size={22} />
                      ) : (
                        <span className="size-[22px]" aria-hidden="true" />
                      )}
                      {o.label}
                      {on && (
                        <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-accent text-[11px] text-white" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {r.kind === 'dimensions' && <p className="mt-2 text-[12.5px] text-ink-3">Pick all that the evidence shows.</p>}
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="mb-3 text-[15px] font-semibold">Sort each statement</legend>
              <SortBoard
                statements={decision.statements}
                tags={tags}
                onChange={(id, tag) =>
                  setTags((cur) => {
                    const next = { ...cur }
                    if (tag) next[id] = tag
                    else delete next[id]
                    return next
                  })
                }
              />
            </fieldset>
          )}

          {step === 2 && (
            <fieldset>
              <legend className="mb-3 text-[15px] font-semibold">{decision.prompt}</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {decision.choices.map((c) => (
                  <ChoiceCard key={c.id} c={c} on={choice === c.id} onPick={() => setChoice(c.id)} />
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          )}
          {step < 2 ? (
            <button type="button" className="btn btn-primary btn-lg" disabled={!done[step]} onClick={() => setStep(step + 1)}>
              Next →
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" disabled={!done.every(Boolean) || busy}>
              {busy ? 'Saving…' : 'Lock it in'}
            </button>
          )}
          <span className="ml-auto text-[12px] text-ink-3">Judged on the {evidenceCount} events so far</span>
        </div>
      </form>
    </section>
  )
}

const CRITERION: Record<Criterion, { label: string; icon: string }> = {
  recognition: { label: 'Noticed', icon: '◉' },
  communication: { label: 'Acted', icon: '➜' },
  evidence: { label: 'Fact vs. guess', icon: '⚖' },
  handover: { label: 'Handover', icon: '✎' },
}

export function ScoreLineRow({ item, earned, max, reason }: { item: string; earned: number; max: number; reason: string }) {
  const tone = toneOf(earned, max)
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[14px]">{item.replace(/^.*? · /, '')}</b>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[12.5px] font-bold tabular-nums" style={{ background: `var(--color-${tone}-soft)`, color: `var(--color-${tone})` }}>
          {earned}/{max}
        </span>
      </div>
      <p className="mt-1 text-[13.5px] text-ink-2">{reason}</p>
    </li>
  )
}

function Bar({ line }: { line: ScoreLine }) {
  const [open, setOpen] = useState(false)
  const shown = useCountUp(line.earned, 700)
  const tone = toneOf(line.earned, line.max)
  const c = CRITERION[line.criterion]
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${c.label}: ${line.earned} of ${line.max}. Why?`}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2 text-[13.5px]">
          <span aria-hidden="true" className="w-4 text-center" style={{ color: `var(--color-${tone})` }}>
            {c.icon}
          </span>
          <b className="flex-1">{c.label}</b>
          <span className="font-bold tabular-nums" style={{ color: `var(--color-${tone})` }}>
            {shown}/{line.max}
          </span>
          <span aria-hidden="true" className={`text-[10px] text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▸
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${(shown / line.max) * 100}%`, background: `var(--color-${tone})` }} />
        </div>
      </button>
      {open && <p className="pop mt-2 text-[13px] text-ink-2">{line.reason}</p>}
    </li>
  )
}

export function FeedbackCard({ feedback }: { feedback: DecisionFeedback }) {
  const earned = feedback.lines.reduce((n, l) => n + l.earned, 0)
  const max = feedback.lines.reduce((n, l) => n + l.max, 0)
  const shown = useCountUp(earned)
  const tone = toneOf(earned, max)
  const verdict = tone === 'good' ? 'Strong call.' : tone === 'mid' ? 'Partly there.' : 'Worth rethinking.'
  const misses = feedback.answers.filter((a) => a.answer !== a.yours)
  return (
    <section className="card flip-in overflow-hidden" aria-labelledby="feedback-title" aria-live="polite">
      <div className="flex items-center gap-4 p-4 sm:p-5" style={{ background: `var(--color-${tone}-soft)` }}>
        <div className="grid size-[72px] shrink-0 place-items-center rounded-2xl bg-surface shadow-sm">
          <span className="font-serif text-[30px] leading-none font-bold tabular-nums" style={{ color: `var(--color-${tone})` }}>
            {shown}
          </span>
          <span className="text-[11px] text-ink-3">of {max}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{feedback.title.split('.')[0]}</p>
          <h2 id="feedback-title" className="text-[21px]" style={{ color: `var(--color-${tone})` }}>
            {verdict}
          </h2>
          <p className="truncate text-[13.5px] text-ink-2">{feedback.choice}</p>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <ul className="space-y-3">
          {feedback.lines.map((l) => (
            <Bar key={l.item} line={l} />
          ))}
        </ul>
        {misses.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {misses.map((a) => (
              <li key={a.statement} className="flex gap-2 rounded-lg bg-poor-soft/60 px-3 py-2 text-[13px]">
                <span aria-hidden="true" className="text-poor">
                  ✗
                </span>
                <span>
                  “{a.statement}” is <b>{a.answer.toLowerCase()}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-4 text-[13.5px]">
          <summary className="cursor-pointer font-medium text-accent">What a strong answer looked like</summary>
          <p className="mt-2 text-ink-2">{feedback.expected}</p>
        </details>
      </div>
    </section>
  )
}
