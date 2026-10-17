'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useMemo, useState } from 'react'
import { Actions } from '@/components/thread/Actions'
import { CiteChips } from '@/components/thread/Cited'
import { MeasureChart } from '@/components/thread/MeasureChart'
import { ThreadLine } from '@/components/thread/ThreadLine'
import { ShiftTrail } from '@/components/ShiftTrail'
import { ErrorBox, Panel, Skeleton, StateChip, Sticky } from '@/components/ui'
import { get, withAsOf } from '@/lib/api'
import { displayName, when } from '@/lib/format'
import { useAsOf, useHref, useMeta } from '@/lib/hooks'
import type { ThreadDetail } from '@/lib/types'

export default function ThreadPage() {
  return (
    <Suspense>
      <ThreadView />
    </Suspense>
  )
}

function ThreadView() {
  const id = useSearchParams().get('id') ?? ''
  const [asOf, setAsOf] = useAsOf()
  const href = useHref()
  const meta = useMeta()
  const [focus, setFocus] = useState<string[]>([])
  const q = useQuery({
    queryKey: ['thread', id, asOf],
    queryFn: () => get<ThreadDetail>(withAsOf(`/threads/${encodeURIComponent(id)}`, asOf)),
    enabled: !!id,
    placeholderData: (prev) => prev,
  })
  const d = q.data
  const sources = useMemo(() => Object.fromEntries((d?.sources ?? []).map((s) => [s.source_id, s])), [d])
  const focusSet = useMemo(() => new Set(focus), [focus])

  if (!id) return <ErrorBox error={new Error('No thread selected.')} />
  if (q.isError) {
    return (
      <div className="space-y-4">
        <Link href={href('/')} className="btn btn-sm">
          ← Back to the queue
        </Link>
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      </div>
    )
  }
  if (!d) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="panel p-6">
          <Skeleton lines={8} />
        </div>
        <div className="panel p-6">
          <Skeleton lines={5} />
        </div>
      </div>
    )
  }

  const t = d.thread
  const r = d.resident
  const name = r.preferred_name ?? r.display_name.split(' ')[0] ?? ''
  const isNow = !asOf || asOf === meta.data?.now
  const unused = d.sources.filter((s) => !s.in_thread)

  return (
    <div className={q.isFetching ? 'opacity-80 transition-opacity' : ''}>
      <Link href={href('/')} className="no-print mb-4 inline-block text-[14px] text-ink-2 underline underline-offset-4">
        ← Needs review
      </Link>

      <header className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="label">
            Concern thread · {d.summary.domain_label} · {t.thread_id}
          </div>
          <h1 className="mt-1 text-[30px] sm:text-[34px]">{displayName({ display_name: r.display_name, preferred_name: r.preferred_name })}</h1>
          <p className="text-ink-2">
            Room {r.room} · {r.wing} wing · {r.age} · {r.synthetic_profile}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StateChip state={t.state} />
            <span className="font-bold">{t.review_reason}</span>
          </div>
          <div className="mt-2">
            <ShiftTrail shifts={t.shifts_spanned} />
          </div>
        </div>
        <ReplayStrip d={d} asOf={asOf} onPick={(at) => setAsOf(at === meta.data?.now ? null : at)} />
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="timeline-h" className="min-w-0">
          <h2 id="timeline-h" className="mb-3 text-[20px]">
            The thread <span className="text-[14px] font-normal text-ink-3">· {t.events.length} pieces of evidence, oldest first</span>
          </h2>
          <ThreadLine events={t.events} steps={t.steps} links={t.links} gaps={t.gaps} labels={d.labels} sources={sources} focus={focusSet} onFocus={setFocus} />
        </section>

        <aside className="space-y-5" aria-label="Explanation and actions">
          <Panel title="Why this thread is open">
            {t.explanation ? (
              <>
                <ul className="space-y-2">
                  {t.explanation.sentences.map((s) => (
                    <li key={s.text} className="leading-relaxed">
                      {s.text}
                      <CiteChips ids={s.cites} labels={d.labels} onFocus={setFocus} />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12.5px] text-ink-3">
                  {t.explanation.validation.ok
                    ? '✓ Every sentence cites evidence in this thread; numbers and times checked; no diagnostic language.'
                    : `Validator issues: ${t.explanation.validation.issues.join(' ')}`}
                </p>
              </>
            ) : (
              <p>No explanation.</p>
            )}
          </Panel>

          {t.explanation && (
            <Sticky tilt={-0.8}>
              <p className="label" style={{ color: 'var(--color-ink-2)' }}>
                Suggested next step
              </p>
              <p className="mt-1 text-[16px] font-bold">{t.explanation.next_step.text}</p>
              <p className="mt-1 text-[12.5px] text-ink-2">A verification step from the care plan, not a treatment recommendation.</p>
            </Sticky>
          )}

          <Panel title="Act on it">
            <Actions threadId={t.thread_id} domain={t.domain} name={name} disabled={!isNow} />
            {t.reviews.length > 0 && (
              <ul className="mt-4 space-y-1 border-t-2 border-dashed border-line-soft pt-3 text-[13.5px]">
                {t.reviews.map((rv) => (
                  <li key={rv.action_id}>
                    <b>{when(rv.timestamp)}</b> · {rv.actor}: {rv.action_type === 'mark_reviewed' ? 'reviewed' : 'verified'}
                    {rv.note && ` · “${rv.note}”`}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={d.rule?.metric === 'assist_level' ? 'Mobility checks' : 'Fluid rounds'}>
            <MeasureChart sources={d.sources} rule={d.rule} gaps={t.gaps} asOf={t.as_of} labels={d.labels} />
          </Panel>

          <Panel title={`${name}’s care plan`}>
            {d.rule && <p className="text-[14.5px]">{d.rule.description}</p>}
            {d.rule && !d.rule.baseline_documented && (
              <p className="mt-1 text-[14px] font-bold" style={{ color: 'var(--color-ambiguous)' }}>
                No baseline documented yet.
              </p>
            )}
            {[...r.preferences, ...r.communication].length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14.5px] text-ink-2">
                {[...r.preferences, ...r.communication].map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[12.5px] text-ink-3">
              Follow-up window: {d.rule?.resolution_window_hours ?? 8} h. Demonstration rule, not clinical guidance.
            </p>
          </Panel>

          {unused.length > 0 && (
            <Panel title="Other records for this resident" aside={<span className="text-[12.5px] text-ink-3">not part of this thread</span>}>
              <ul className="space-y-2 text-[14px]">
                {unused.map((s) => (
                  <li key={s.source_id}>
                    <b>{when(s.event_time)}</b> · {s.author}
                    <p className="text-ink-2">{s.text ?? `${s.value} ${s.unit}`}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  )
}

function ReplayStrip({ d, asOf, onPick }: { d: ThreadDetail; asOf: string | null; onPick: (at: string) => void }) {
  const current = asOf ?? d.replay[d.replay.length - 1]?.at
  return (
    <div className="panel p-4 no-print">
      <p className="label">Replay across handovers</p>
      <p className="mb-2 text-[13px] text-ink-3">What could each shift have known?</p>
      <ol className="space-y-1">
        {d.replay.map((p) => {
          const active = p.at === current
          return (
            <li key={p.at}>
              <button
                type="button"
                onClick={() => onPick(p.at)}
                aria-pressed={active}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[14px] ${active ? 'bg-sticky font-bold' : 'hover:bg-fill'}`}
              >
                <span>{p.label}</span>
                {p.state ? <StateChip state={p.state} short /> : <span className="text-[13px] text-ink-3">not yet open</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
