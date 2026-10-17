'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { ErrorBox, PageTitle, Panel, Skeleton, StateChip, Sticky } from '@/components/ui'
import { get, post, STATIC } from '@/lib/api'
import { displayName } from '@/lib/format'
import { useHref } from '@/lib/hooks'
import type { ClinicalEvent, KeywordReading, LabResult, ResidentRow, ThreadSummary } from '@/lib/types'

interface Sample {
  id: string
  title: string
  resident_id: string
  text: string
  why: string
  result: LabResult
}

const KIND_COLOR: Record<ClinicalEvent['kind'], string> = {
  observation: 'var(--color-persistent)',
  refusal: 'var(--color-persistent)',
  intervention: 'var(--color-watching)',
  assessment: 'var(--color-watching)',
  escalation: 'var(--color-watching)',
  plan: 'var(--color-ink-3)',
}

function readable(e: ClinicalEvent): string {
  if (e.modality === 'planned') return `${e.kind} — planned, not done`
  if (e.modality === 'negated') return `${e.kind} — documented as not done`
  if (e.modality === 'hypothetical') return `${e.kind} — hypothetical`
  if (e.kind === 'observation') {
    if (e.value != null) return `observation — ${e.approximate ? '~' : ''}${e.value} ${e.unit} (${e.polarity.replace('_', ' ')})`
    return `observation — ${e.polarity === 'worse' ? 'low / worse, no amount' : e.polarity === 'better' ? 'better, no amount' : 'described, no amount'}`
  }
  return e.kind
}

function keywordText(k: KeywordReading): string {
  if (k.kind === 'observation') {
    if (k.polarity === 'meets_target') return k.value != null ? `intake of ${k.value} mL — target met` : 'good outcome — target met'
    return 'low intake'
  }
  return k.kind === 'intervention' ? 'response done' : k.kind
}

/** Does THREAD's reading of this sentence agree with the keyword reader's conclusion? */
function agrees(k: KeywordReading, events: ClinicalEvent[], text: string): boolean {
  const start = text.indexOf(k.sentence)
  const inSentence = events.filter((e) => e.span && e.span.start >= start && e.span.end <= start + k.sentence.length + 1)
  return inSentence.some(
    (e) =>
      e.kind === k.kind &&
      e.modality === 'done' &&
      !e.flags.includes('other_subject') &&
      (k.kind !== 'observation' || (k.polarity === 'meets_target') === (e.polarity === 'meets_target')),
  )
}

function Highlighted({ text, events }: { text: string; events: ClinicalEvent[] }) {
  const spans = [...new Map(events.filter((e) => e.span).map((e) => [`${e.span!.start}`, e])).values()].sort(
    (a, b) => a.span!.start - b.span!.start,
  )
  const parts: React.ReactNode[] = []
  let at = 0
  spans.forEach((e, i) => {
    const s = e.span!
    if (s.start < at) return
    parts.push(text.slice(at, s.start))
    parts.push(
      <mark key={i} className="rounded-sm px-0.5" style={{ background: 'var(--color-highlight)', boxShadow: `inset 0 -3px 0 ${KIND_COLOR[e.kind]}` }}>
        {text.slice(s.start, s.end)}
      </mark>,
    )
    at = s.end
  })
  parts.push(text.slice(at))
  return <p className="note-paper whitespace-pre-wrap">{parts}</p>
}

export default function LabPage() {
  const href = useHref()
  const qc = useQueryClient()
  const samples = useQuery({ queryKey: ['lab-samples'], queryFn: () => get<Sample[]>('/lab/samples') })
  const residents = useQuery({ queryKey: ['residents'], queryFn: () => get<ResidentRow[]>('/residents') })
  const [text, setText] = useState('')
  const [rid, setRid] = useState('R214')
  const [result, setResult] = useState<LabResult | null>(null)
  const [added, setAdded] = useState<ThreadSummary[] | null>(null)

  const read = useMutation({
    mutationFn: () => post<LabResult>('/lab/extract', { text, resident_id: rid }),
    onSuccess: (r) => {
      setResult(r)
      setAdded(null)
    },
  })
  const add = useMutation({
    mutationFn: () => post<{ threads: ThreadSummary[] }>('/notes', { resident_id: rid, text, author: 'RN Demo', author_role: 'RN' }),
    onSuccess: (r) => {
      setAdded(r.threads)
      qc.invalidateQueries()
    },
  })

  const pick = (s: Sample) => {
    setText(s.text)
    setRid(s.resident_id)
    setResult(s.result)
    setAdded(null)
  }
  const current = samples.data?.find((s) => s.text === text && s.resident_id === rid)
  const resName = residents.data?.find((r) => r.resident_id === rid)

  return (
    <>
      <PageTitle kicker="Note lab" title={<>What THREAD reads in a note, <span className="scribble">and why</span></>} />
      <p className="mb-6 max-w-[780px] text-ink-2">
        Care notes are where the meaning is, and where a keyword search goes wrong: “offered” is not “drank”, “will reassess”
        is not “reassessed”, and “didn’t do well” has no amount in it. Pick a tricky note or write your own.
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Tricky notes">
            {samples.isError ? (
              <ErrorBox error={samples.error} />
            ) : !samples.data ? (
              <Skeleton lines={3} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {samples.data.map((s) => (
                  <button key={s.id} type="button" className={`btn btn-sm ${current?.id === s.id ? 'btn-primary' : ''}`} onClick={() => pick(s)} aria-pressed={current?.id === s.id}>
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="The note">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!STATIC) read.mutate()
              }}
            >
              <label className="block">
                <span className="label">Resident</span>
                <select className="input mt-1" value={rid} onChange={(e) => setRid(e.target.value)} disabled={STATIC}>
                  {(residents.data ?? []).map((r) => (
                    <option key={r.resident_id} value={r.resident_id}>
                      {displayName(r)} · Room {r.room}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Progress note</span>
                <textarea
                  className="input mt-1 min-h-[110px]"
                  value={text}
                  maxLength={2000}
                  placeholder="e.g. Offered juice x2, res took a few sips. Will reassess after lunch."
                  onChange={(e) => {
                    setText(e.target.value)
                    setResult(null)
                  }}
                  readOnly={STATIC}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary" disabled={STATIC || !text.trim() || read.isPending}>
                  Read this note
                </button>
                <button type="button" className="btn" disabled={STATIC || !result || add.isPending || !!added} onClick={() => add.mutate()}>
                  Add to {resName?.preferred_name ?? 'the resident'}’s record
                </button>
              </div>
              {STATIC && <p className="text-[13.5px] text-ink-2">The static preview shows the six tricky notes, read at build time. Run locally to write your own.</p>}
              {read.isError && <p className="font-bold" style={{ color: 'var(--color-persistent)' }}>{(read.error as Error).message}</p>}
            </form>
            {current && (
              <Sticky className="mt-4" tilt={0.5}>
                <p className="text-[14.5px]">{current.why}</p>
              </Sticky>
            )}
          </Panel>

          {added && (
            <Panel title="Added to the record" tone="var(--color-verified-soft)">
              {added.length ? (
                <ul className="space-y-2">
                  {added.map((t) => (
                    <li key={t.thread_id} className="flex flex-wrap items-center gap-2">
                      <StateChip state={t.state} />
                      <Link href={href(`/thread?id=${encodeURIComponent(t.thread_id)}`)} className="font-bold underline underline-offset-4">
                        {t.resident.name} · {t.domain_label}
                      </Link>
                      <span className="text-[14px] text-ink-2">{t.review_reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Saved. It did not join any concern thread (no concern signal, or it is about someone else).</p>
              )}
            </Panel>
          )}
        </div>

        <div className="space-y-4" aria-live="polite">
          {!result ? (
            <div className="hatch flex min-h-[260px] items-center justify-center rounded-md border-2 border-dashed border-line-soft p-6 text-center text-ink-2">
              Pick a tricky note, or write one and press “Read this note”.
            </div>
          ) : (
            <>
              <Panel title="THREAD’s reading">
                <Highlighted text={result.text} events={result.events} />
                {result.events.length === 0 ? (
                  <p className="mt-3 text-ink-2">No fluid-intake or mobility event in this note.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {result.events.map((e) => (
                      <li key={e.event_id} className="border-l-4 pl-3" style={{ borderColor: KIND_COLOR[e.kind] }}>
                        <p className="font-bold">
                          {readable(e)}
                          {e.flags.includes('other_subject') && <span className="tag ml-2">about someone else</span>}
                          {e.flags.includes('historical') && <span className="tag ml-2">earlier shift</span>}
                          {e.flags.includes('hedged') && <span className="tag ml-2">hedged</span>}
                        </p>
                        <p className="text-[14px] text-ink-2">“{e.span?.text}”</p>
                        <p className="text-[13px] text-ink-3">
                          {e.triggers.join(' · ')} · reading confidence {e.confidence.toFixed(2)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title="What a keyword matcher would conclude" tone="var(--color-fill)">
                {result.keyword.length === 0 ? (
                  <p className="text-ink-2">Nothing.</p>
                ) : (
                  <ul className="space-y-2">
                    {result.keyword.map((k, i) => {
                      const ok = agrees(k, result.events, result.text)
                      return (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden="true" className="font-bold" style={{ color: ok ? 'var(--color-verified)' : 'var(--color-persistent)' }}>
                            {ok ? '✓' : '✗'}
                          </span>
                          <span>
                            <b>{keywordText(k)}</b> <span className="text-ink-3">from {k.why}</span>
                            {!ok && <span className="sr-only"> (THREAD disagrees)</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <p className="mt-3 text-[13px] text-ink-3">✗ marks a conclusion THREAD does not draw. This is the baseline measured on the Evaluation page.</p>
              </Panel>
            </>
          )}
        </div>
      </div>
    </>
  )
}
