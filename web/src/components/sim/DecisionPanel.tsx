'use client'

import type { Criterion, DecisionFeedback, DecisionInput, PublicDecision, ScoreLine, Tag } from '@thread/engine'
import { useState, type KeyboardEvent } from 'react'
import { toneOf } from '../motion'
import { DimIcon, HAS_ICON } from './ResidentCard'

export const scoreTone = toneOf

export const TAGS: { id: Tag; label: string; hint: string; color: string }[] = [
  { id: 'observed', label: 'Observed', hint: 'seen, heard or charted', color: 'var(--color-observation)' },
  { id: 'assumption', label: 'Assumption', hint: 'an explanation or prediction', color: 'var(--color-mid)' },
  { id: 'unknown', label: 'Unknown', hint: 'not checked or not recorded', color: 'var(--color-unknown)' },
]

const STEPS = ['What changed', 'Fact, assumption, unknown', 'Action']

/** Rows are statements, columns are the three categories. Keys 1, 2, 3 set the focused row. */
function ClassificationTable({ statements, tags, onTag }: { statements: { id: string; text: string }[]; tags: Record<string, Tag>; onTag: (id: string, t: Tag) => void }) {
  const onKey = (id: string) => (e: KeyboardEvent) => {
    const i = ['1', '2', '3'].indexOf(e.key)
    if (i >= 0) {
      e.preventDefault()
      onTag(id, TAGS[i]!.id)
    }
  }
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG: a region that scrolls must be reachable by keyboard
    <section className="overflow-x-auto rounded-lg border border-line" tabIndex={0} aria-label="Statements, scrolls sideways">
      <table className="w-full min-w-[440px] border-collapse text-[14px]">
        <thead>
          <tr className="bg-sunken/70 text-left text-[11.5px] tracking-wide text-ink-3 uppercase">
            <th className="px-3 py-2 font-semibold">Statement</th>
            {TAGS.map((t, i) => (
              <th key={t.id} className="w-[88px] px-1 py-2 text-center font-semibold" title={t.hint}>
                <span style={{ color: t.color }}>{t.label}</span>
                <span className="ml-1 font-mono text-[10px] text-ink-3 normal-case">{i + 1}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statements.map((s) => (
            <tr key={s.id} className="border-t border-line focus-within:bg-accent-soft/40" onKeyDown={onKey(s.id)}>
              <td className="px-3 py-2.5 leading-snug">“{s.text}”</td>
              {TAGS.map((t) => (
                <td key={t.id} className="px-2 py-2.5 text-center">
                  <input
                    type="radio"
                    name={`tag-${s.id}`}
                    checked={tags[s.id] === t.id}
                    onChange={() => onTag(s.id, t.id)}
                    aria-label={`${s.text}: ${t.label}`}
                    className="size-4 cursor-pointer accent-[var(--color-ink)]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
  const sorted = decision.statements.filter((s) => tags[s.id]).length
  const done = [recognition.length > 0, sorted === decision.statements.length, !!choice]
  const toggle = (id: string) => setRecognition((cur) => (r.kind === 'trend' ? [id] : cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  return (
    <section className="card border-l-4 border-l-ink" aria-labelledby="decision-title">
      <div className="border-b border-line px-4 pt-4 pb-3 sm:px-5">
        <p className="eyebrow">Decision · {decision.clock}</p>
        <h2 id="decision-title" className="mt-1 text-[21px]">
          {decision.title}
        </h2>
        <ol className="mt-3 grid grid-cols-3 gap-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => (i <= step || done.slice(0, i).every(Boolean)) && setStep(i)}
                aria-current={i === step ? 'step' : undefined}
                className={`w-full border-t-2 pt-1.5 text-left text-[12px] font-semibold ${i === step ? 'border-ink text-ink' : done[i] ? 'border-accent text-accent-strong' : 'border-line text-ink-3'}`}
              >
                <span className="font-mono">{i + 1}</span> {s}
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
        <div key={step} className="enter">
          {step === 0 && (
            <fieldset className="min-w-0">
              <legend className="mb-3 text-[15px] font-semibold">{r.prompt}</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {r.options.map((o) => {
                  const on = recognition.includes(o.id)
                  return (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[14px] transition-colors ${on ? 'border-ink bg-sunken/60' : 'border-line hover:border-line-strong'}`}
                    >
                      <input
                        type={r.kind === 'trend' ? 'radio' : 'checkbox'}
                        name="recognition"
                        checked={on}
                        onChange={() => toggle(o.id)}
                        className="size-4 accent-[var(--color-ink)]"
                      />
                      {HAS_ICON.has(o.id) && <DimIcon dim={o.id} size={18} />}
                      <span className="font-medium">{o.label}</span>
                    </label>
                  )
                })}
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">{r.kind === 'dimensions' ? 'Select every area the entries support, and only those.' : 'Select one.'}</p>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset className="min-w-0">
              <legend className="mb-3 flex w-full items-baseline justify-between text-[15px] font-semibold">
                Classify each statement
                <span className="font-mono text-[12px] font-medium text-ink-3">
                  {sorted}/{decision.statements.length}
                </span>
              </legend>
              <ClassificationTable statements={decision.statements} tags={tags} onTag={(id, t) => setTags((cur) => ({ ...cur, [id]: t }))} />
            </fieldset>
          )}

          {step === 2 && (
            <fieldset className="min-w-0">
              <legend className="mb-3 text-[15px] font-semibold">{decision.prompt}</legend>
              <div className="grid gap-1.5">
                {decision.choices.map((c) => (
                  <label
                    key={c.id}
                    className={`grid cursor-pointer grid-cols-[auto_1fr] gap-x-3 rounded-lg border px-3 py-2.5 transition-colors ${choice === c.id ? 'border-ink bg-sunken/60' : 'border-line hover:border-line-strong'}`}
                  >
                    <input type="radio" name="choice" value={c.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="row-span-2 mt-1 size-4 accent-[var(--color-ink)]" />
                    <span className="text-[14.5px] font-semibold">{c.label}</span>
                    <span className="text-[13px] text-ink-2">{c.detail}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 2 ? (
            <button type="button" className="btn btn-primary" disabled={!done[step]} onClick={() => setStep(step + 1)}>
              Continue
            </button>
          ) : (
            <button className="btn btn-primary" disabled={!done.every(Boolean) || busy}>
              {busy ? 'Saving…' : 'Submit decision'}
            </button>
          )}
          <span className="ml-auto text-[12px] text-ink-3">Scored on the {evidenceCount} entries visible now</span>
        </div>
      </form>
    </section>
  )
}

const CRITERION: Record<Criterion, string> = {
  recognition: 'Recognition',
  communication: 'Communication',
  evidence: 'Fact vs. assumption',
  handover: 'Handover',
}

export function ScoreLineRow({ item, earned, max, reason }: { item: string; earned: number; max: number; reason: string }) {
  const tone = toneOf(earned, max)
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex items-baseline justify-between gap-3">
        <b className="text-[14px]">{item.replace(/^.*? · /, '')}</b>
        <span className="shrink-0 font-mono text-[12.5px] font-semibold tabular-nums" style={{ color: `var(--color-${tone})` }}>
          {earned}/{max}
        </span>
      </div>
      <p className="mt-1 text-[13.5px] text-ink-2">{reason}</p>
    </li>
  )
}

/** A bullet bar: earned against maximum, with the reason one click away. */
export function ScoreBar({ line, label }: { line: Pick<ScoreLine, 'earned' | 'max' | 'reason'>; label: string }) {
  const [open, setOpen] = useState(false)
  const tone = toneOf(line.earned, line.max)
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`${label}: ${line.earned} of ${line.max}. Show reason`} className="grid w-full grid-cols-[140px_1fr_52px] items-center gap-3 text-left">
        <span className="text-[13px] font-semibold">{label}</span>
        <span className="relative h-3 rounded-sm bg-sunken" aria-hidden="true">
          <span className="absolute inset-y-0 left-0 rounded-sm transition-[width] duration-500" style={{ width: `${(line.earned / line.max) * 100}%`, background: `var(--color-${tone})` }} />
          <span className="absolute inset-y-[-3px] right-0 w-0.5 bg-ink/40" />
        </span>
        <span className="text-right font-mono text-[12.5px] font-semibold tabular-nums">
          {line.earned}/{line.max}
        </span>
      </button>
      {open && <p className="enter mt-2 ml-[152px] text-[13px] text-ink-2">{line.reason}</p>}
    </li>
  )
}

export function FeedbackCard({ feedback }: { feedback: DecisionFeedback }) {
  const earned = feedback.lines.reduce((n, l) => n + l.earned, 0)
  const max = feedback.lines.reduce((n, l) => n + l.max, 0)
  const tone = toneOf(earned, max)
  const comm = feedback.lines.find((l) => l.criterion === 'communication')
  const lead = comm?.reason.replace(/^“.*?”\.\s*/, '').split(/(?<=\.)\s/)[0] ?? ''
  const misses = feedback.answers.filter((a) => a.answer !== a.yours)
  return (
    <section className="card enter border-l-4" style={{ borderLeftColor: `var(--color-${tone})` }} aria-labelledby="feedback-title" aria-live="polite">
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 pt-4 pb-3 sm:px-5">
        <div className="min-w-0">
          <p className="eyebrow">Feedback · {feedback.title.split('.')[0]}</p>
          <h2 id="feedback-title" className="mt-1 text-[19px] leading-snug">
            {feedback.choice}
          </h2>
        </div>
        <p className="shrink-0 text-right">
          <span className="font-serif text-[30px] leading-none font-semibold tabular-nums" style={{ color: `var(--color-${tone})` }}>
            {earned}
          </span>
          <span className="font-mono text-[13px] text-ink-3"> / {max}</span>
        </p>
      </div>
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-[14px] text-ink-2">{lead}</p>
        <ul className="space-y-2.5">
          {feedback.lines.map((l) => (
            <ScoreBar key={l.item} line={l} label={CRITERION[l.criterion]} />
          ))}
        </ul>
        {misses.length > 0 && (
          <div>
            <p className="text-[12px] font-semibold tracking-wide text-ink-3 uppercase">Misclassified</p>
            <ul className="mt-1.5 divide-y divide-line rounded-lg border border-line text-[13px]">
              {misses.map((a) => (
                <li key={a.statement} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2">
                  <span>“{a.statement}”</span>
                  <span className="text-right text-ink-3">
                    <s>{a.yours}</s> <b className="text-ink">{a.answer}</b>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <details className="text-[13.5px]">
          <summary className="cursor-pointer font-medium text-accent">What a strong answer looked like</summary>
          <p className="mt-2 text-ink-2">{feedback.expected}</p>
        </details>
      </div>
    </section>
  )
}
