'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorBox, PageTitle, Panel, Skeleton, Sticky } from '@/components/ui'
import { get } from '@/lib/api'
import type { EvalConfig, EvalMetrics, Evaluation } from '@/lib/types'

const COLOR: Record<string, string> = {
  structured_only: 'var(--color-ink-3)',
  keyword: 'var(--color-newsignal)',
  thread: 'var(--color-verified)',
  llm: 'var(--color-ambiguous)',
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const STATE_TEXT = (s: string) => s.replace(/_/g, ' ')

function Bar({ value, color }: { value: number | null | undefined; color: string }) {
  const v = Math.max(0, Math.min(1, value ?? 0))
  return (
    <div className="flex items-center gap-2">
      <div className="h-3.5 flex-1 rounded-sm border-2 border-ink bg-surface" aria-hidden="true">
        <div className="h-full" style={{ width: `${v * 100}%`, background: color }} />
      </div>
      <span className="w-11 text-right text-[14px] font-bold tabular-nums">{pct(value)}</span>
    </div>
  )
}

function Headline({ c, split }: { c: EvalConfig; split: 'dev' | 'held_out' }) {
  const m = c.splits[split]
  return (
    <div className="panel p-4" style={{ ['--sketch-color' as string]: COLOR[c.key] }}>
      <p className="font-bold" style={{ color: COLOR[c.key] }}>
        {c.label}
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_minmax(150px,45%)] items-center gap-x-3 gap-y-1.5 text-[14px]">
        <dt>Concerns caught (recall)</dt>
        <dd>
          <Bar value={m.review.recall} color={COLOR[c.key]!} />
        </dd>
        <dt>Exact state</dt>
        <dd>
          <Bar value={m.state_accuracy} color={COLOR[c.key]!} />
        </dd>
        <dt>Marked resolved wrongly</dt>
        <dd className="text-right text-[18px] font-bold" style={{ color: m.false_closures ? 'var(--color-persistent)' : 'var(--color-verified)' }}>
          {m.false_closures}
        </dd>
      </dl>
    </div>
  )
}

const ROWS: [string, (m: EvalMetrics) => string][] = [
  ['Review recall', (m) => pct(m.review.recall)],
  ['False-positive rate', (m) => pct(m.review.false_positive_rate)],
  ['Missed reviews', (m) => String(m.missed_reviews)],
  ['False closures', (m) => String(m.false_closures)],
  ['Exact state', (m) => pct(m.state_accuracy)],
  ['Replay (earlier handover)', (m) => pct(m.replay_accuracy)],
  ['Link F1', (m) => pct(m.links.f1)],
  ['Note extraction F1', (m) => pct(m.extraction?.f1)],
  ['Unsupported claims', (m) => `${m.unsupported_claim_rate * 100}% of ${m.explanation_sentences}`],
]

export default function EvaluationPage() {
  const q = useQuery({ queryKey: ['evaluation'], queryFn: () => get<Evaluation>('/evaluation') })
  const [split, setSplit] = useState<'held_out' | 'dev'>('held_out')
  const [show, setShow] = useState('thread')

  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const r = q.data
  if (!r)
    return (
      <div className="panel p-6">
        <Skeleton lines={8} />
      </div>
    )
  const shown = r.configs.find((c) => c.key === show) ?? r.configs[0]!
  const families = r.families

  return (
    <>
      <PageTitle kicker={`Evaluation · ${r.scenarios} labelled scenarios`} title={<>Where it works, and <span className="scribble">where it doesn’t</span></>}>
        <div className="flex gap-1" aria-label="Split">
          {(['held_out', 'dev'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={split === s} className={`btn btn-sm ${split === s ? 'btn-primary' : ''}`} onClick={() => setSplit(s)}>
              {s === 'held_out' ? `Held-out (${r.splits.held_out})` : `Dev (${r.splits.dev})`}
            </button>
          ))}
        </div>
      </PageTitle>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <p className="max-w-[760px] text-ink-2">
          The same state machine, fed by three readers of the notes. Ground truth comes from how each scenario was built, not
          from the engine. Held-out notes were written separately and never used for tuning, so they are the honest test.
        </p>
        <Sticky tilt={0.6}>
          <p className="text-[14px]">{r.caveat}</p>
        </Sticky>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {r.configs.map((c) => (
          <Headline key={c.key} c={c} split={split} />
        ))}
      </div>

      <Panel title="Every metric" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[14.5px]">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="py-2 pr-4">{split === 'held_out' ? 'Held-out' : 'Dev'}</th>
                {r.configs.map((c) => (
                  <th key={c.key} className="py-2 pr-4" style={{ color: COLOR[c.key] }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, f]) => (
                <tr key={label} className="border-b-2 border-dashed border-line-soft">
                  <th scope="row" className="py-1.5 pr-4 font-normal">
                    {label}
                  </th>
                  {r.configs.map((c) => (
                    <td key={c.key} className="py-1.5 pr-4 font-bold tabular-nums">
                      {f(c.splits[split])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[13px] text-ink-3">
          A false closure is the dangerous error: a concern marked verified that should still be open. Measurements-only has no
          note extraction to score.
        </p>
      </Panel>

      <Panel title="By scenario family (both splits)" className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-[14px]">
            <thead>
              <tr className="border-b-2 border-ink">
                <th className="py-2 pr-3">Family</th>
                <th className="py-2 pr-3">Expected</th>
                {r.configs.map((c) => (
                  <th key={c.key} className="py-2 pr-3" style={{ color: COLOR[c.key] }}>
                    {c.label.split(' ')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {families.map(([fam, desc]) => (
                <tr key={fam} className="border-b-2 border-dashed border-line-soft">
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    <b>{fam}</b> · {desc}
                  </th>
                  <td className="py-1.5 pr-3 text-ink-2">{STATE_TEXT(r.configs[0]!.families[fam]!.expected)}</td>
                  {r.configs.map((c) => {
                    const f = c.families[fam]!
                    const all = f.correct === f.total
                    return (
                      <td key={c.key} className="py-1.5 pr-3 font-bold tabular-nums" style={{ color: all ? 'var(--color-verified)' : f.correct === 0 ? 'var(--color-persistent)' : 'var(--color-unverified)' }}>
                        {all ? '✓' : f.correct === 0 ? '✗' : '◐'} {f.correct}/{f.total}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Every error, with the notes behind it"
        className="mt-6"
        aside={
          <select className="input w-auto" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Reader">
            {r.configs.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label} ({c.errors.length})
              </option>
            ))}
          </select>
        }
      >
        {shown.errors.length === 0 ? (
          <p>No state errors.</p>
        ) : (
          <ul className="space-y-3">
            {shown.errors.map((e) => (
              <li key={e.scenario_id} className="border-l-4 pl-3" style={{ borderColor: e.kind === 'false closure' || e.kind === 'missed review' ? 'var(--color-persistent)' : 'var(--color-unverified)' }}>
                <p className="font-bold">
                  {e.scenario_id} · {e.family} · {e.kind}: expected {STATE_TEXT(e.expected)}, got {STATE_TEXT(e.got)}
                  <span className="tag ml-2">{e.split === 'held_out' ? 'held-out' : 'dev'}</span>
                </p>
                <p className="text-[14px] text-ink-2">{e.description}</p>
                {e.notes.map((n) => (
                  <p key={n} className="note-paper mt-1 text-[14px]">
                    {n}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
        {shown.extraction_misses.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer font-bold">Note readings that differ from the gold labels ({shown.extraction_misses.length})</summary>
            <ul className="mt-2 space-y-2 text-[14px]">
              {shown.extraction_misses.map((m, i) => (
                <li key={i}>
                  <span className="tag mr-2">{m.split === 'held_out' ? 'held-out' : 'dev'}</span>“{m.note}”
                  <br />
                  <span className="text-ink-2">
                    expected [{m.expected.join('; ') || 'nothing'}] · read [{m.got.join('; ') || 'nothing'}]
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>
    </>
  )
}
