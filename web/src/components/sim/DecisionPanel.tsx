'use client'

import type { DecisionFeedback, DecisionInput, PublicDecision, Tag } from '@thread/engine'
import { useState } from 'react'
import { DimIcon } from './ResidentCard'

const TAGS: { id: Tag; label: string; hint: string }[] = [
  { id: 'observed', label: 'Observed', hint: 'Someone saw, heard or recorded it' },
  { id: 'assumption', label: 'Assumption', hint: 'A guess, explanation or prediction' },
  { id: 'unknown', label: 'Unknown', hint: 'Nobody has checked or recorded it' },
]

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="float-left flex w-full items-center gap-2 text-[15px] font-semibold">
        <span
          className={`grid size-6 place-items-center rounded-full text-[12.5px] ${done ? 'bg-accent text-white' : 'border border-line-strong text-ink-2'}`}
          aria-hidden="true"
        >
          {done ? '✓' : n}
        </span>
        {title}
      </legend>
      <div className="clear-both pt-3">{children}</div>
    </fieldset>
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
  const [recognition, setRecognition] = useState<string[]>([])
  const [tags, setTags] = useState<Record<string, Tag>>({})
  const [choice, setChoice] = useState<string | null>(null)
  const r = decision.recognition
  const recDone = recognition.length > 0
  const tagsDone = decision.statements.every((s) => tags[s.id])
  const ready = recDone && tagsDone && !!choice

  const toggle = (id: string) =>
    setRecognition((cur) => (r.kind === 'trend' ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <section className="card border-2 border-accent/60 p-4 sm:p-5" aria-labelledby="decision-title">
      <p className="eyebrow text-accent">Decision point · {decision.clock}</p>
      <h2 id="decision-title" className="mt-1 text-[22px]">
        {decision.title}
      </h2>
      <p className="mt-1 text-[14.5px] text-ink-2">{decision.prompt}</p>
      <p className="mt-2 text-[12.5px] text-ink-3">
        You’ll be judged only on the {evidenceCount} events in the timeline so far, not on what happens next.
      </p>

      <form
        className="mt-5 space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) onSubmit({ recognition, tags, choice: choice! })
        }}
      >
        <Step n={1} title={r.prompt} done={recDone}>
          <div className="flex flex-wrap gap-2">
            {r.options.map((o) => {
              const on = recognition.includes(o.id)
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(o.id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[14px] font-medium transition-colors ${on ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong hover:bg-sunken'}`}
                >
                  {r.kind === 'dimensions' && ['mobility', 'intake', 'engagement'].includes(o.id) && <DimIcon dim={o.id} size={16} />}
                  {o.label}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-3">{r.kind === 'dimensions' ? 'Choose all that apply. Only choose what the evidence shows.' : 'Choose one.'}</p>
        </Step>

        <Step n={2} title="Fact, assumption or unknown?" done={tagsDone}>
          <ul className="space-y-2.5">
            {decision.statements.map((s) => (
              <li key={s.id} className="rounded-lg border border-line p-3">
                <p className="text-[14.5px]">“{s.text}”</p>
                <fieldset className="mt-2 grid grid-cols-3 gap-1.5">
                  <legend className="sr-only">Classify: {s.text}</legend>
                  {TAGS.map((t) => {
                    const on = tags[s.id] === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        title={t.hint}
                        onClick={() => setTags((cur) => ({ ...cur, [s.id]: t.id }))}
                        className={`rounded-md border px-2 py-1.5 text-[13px] font-medium transition-colors ${on ? 'border-ink bg-ink text-white' : 'border-line-strong text-ink-2 hover:bg-sunken'}`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </fieldset>
              </li>
            ))}
          </ul>
        </Step>

        <Step n={3} title="What do you do?" done={!!choice}>
          <div className="space-y-2">
            {decision.choices.map((c) => (
              <label
                key={c.id}
                className={`grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-lg border p-3 transition-colors ${choice === c.id ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-sunken'}`}
              >
                <input type="radio" name="choice" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="row-span-2 mt-1 accent-[var(--color-accent)]" />
                <span className="text-[14.5px] font-bold">{c.label}</span>
                <span className="text-[13.5px] text-ink-2">{c.detail}</span>
              </label>
            ))}
          </div>
        </Step>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button className="btn btn-primary btn-lg" disabled={!ready || busy}>
            {busy ? 'Saving…' : 'Lock in this decision'}
          </button>
          {!ready && (
            <span className="text-[13px] text-ink-3">
              {!recDone ? 'Step 1 needs an answer.' : !tagsDone ? 'Sort every statement in step 2.' : 'Choose an action in step 3.'}
            </span>
          )}
        </div>
      </form>
    </section>
  )
}

export function scoreTone(earned: number, max: number) {
  const p = max ? earned / max : 0
  return p >= 0.8 ? 'good' : p >= 0.5 ? 'mid' : 'poor'
}

export function ScoreLineRow({ item, earned, max, reason }: { item: string; earned: number; max: number; reason: string }) {
  const tone = scoreTone(earned, max)
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

export function FeedbackCard({ feedback, onContinue, canContinue, busy }: { feedback: DecisionFeedback; onContinue?: () => void; canContinue: boolean; busy: boolean }) {
  const earned = feedback.lines.reduce((n, l) => n + l.earned, 0)
  const max = feedback.lines.reduce((n, l) => n + l.max, 0)
  const tone = scoreTone(earned, max)
  return (
    <section className="card reveal p-4 sm:p-5" aria-labelledby="feedback-title" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Feedback · judged on what you knew then</p>
          <h2 id="feedback-title" className="mt-1 text-[20px]">
            {feedback.title}
          </h2>
        </div>
        <span className="shrink-0 rounded-xl px-3 py-1.5 text-center" style={{ background: `var(--color-${tone}-soft)`, color: `var(--color-${tone})` }}>
          <b className="block text-[20px] leading-none tabular-nums">
            {earned}/{max}
          </b>
          <span className="text-[11.5px] font-semibold">points</span>
        </span>
      </div>
      <p className="mt-2 text-[14px]">
        You chose: <b>{feedback.choice}</b>
      </p>
      <ul className="mt-3 space-y-2">
        {feedback.lines.map((l) => (
          <ScoreLineRow key={l.item} {...l} />
        ))}
      </ul>
      <details className="mt-3 text-[14px]">
        <summary className="cursor-pointer font-medium text-accent">See each statement’s answer</summary>
        <ul className="mt-2 space-y-1.5">
          {feedback.answers.map((a) => (
            <li key={a.statement} className="text-[13.5px]">
              <span className={a.answer === a.yours ? 'text-good' : 'text-poor'} aria-hidden="true">
                {a.answer === a.yours ? '✓ ' : '✗ '}
              </span>
              “{a.statement}” <b>{a.answer}</b>
              {a.answer !== a.yours && <span className="text-ink-3"> (you said {a.yours.toLowerCase()})</span>}. <span className="text-ink-2">{a.why}</span>
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-3 rounded-lg bg-accent-soft/60 p-3 text-[13.5px]">
        <b className="text-accent-strong">A thoughtful response here: </b>
        {feedback.expected}
      </div>
      {onContinue && (
        <button className="btn btn-primary mt-4" onClick={onContinue} disabled={!canContinue || busy}>
          See what happens next →
        </button>
      )}
    </section>
  )
}
