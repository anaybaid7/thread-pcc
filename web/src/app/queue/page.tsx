'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CompactRow, QueueCard } from '@/components/QueueCard'
import { Empty, ErrorBox, PageTitle, Panel, Skeleton, Stat, Sticky } from '@/components/ui'
import { get, withAsOf } from '@/lib/api'
import { displayName, when } from '@/lib/format'
import { useAsOf, useHref, useMeta } from '@/lib/hooks'
import type { Queue, State } from '@/lib/types'

const STATE_FILTERS: { value: 'all' | State; label: string }[] = [
  { value: 'all', label: 'All states' },
  { value: 'persistent_signal', label: 'Persistent' },
  { value: 'new_signal', label: 'New signal' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'ambiguous', label: 'Ambiguous' },
]

export default function QueuePage() {
  const [asOf] = useAsOf()
  const href = useHref()
  const meta = useMeta()
  const q = useQuery({ queryKey: ['queue', asOf], queryFn: () => get<Queue>(withAsOf('/queue', asOf)) })
  const [domain, setDomain] = useState('all')
  const [state, setState] = useState<'all' | State>('all')
  const [wing, setWing] = useState('all')

  const items = useMemo(
    () =>
      (q.data?.items ?? []).filter(
        (t) =>
          (domain === 'all' || t.domain === domain) &&
          (state === 'all' || t.state === state) &&
          (wing === 'all' || t.resident.wing === wing),
      ),
    [q.data, domain, state, wing],
  )
  const now = q.data?.as_of ?? meta.data?.now ?? ''
  const threadHref = (id: string) => href(`/thread?id=${encodeURIComponent(id)}`)

  return (
    <>
      <PageTitle
        kicker={meta.data ? `${meta.data.shift} shift · ${when(now)}` : 'Morning huddle'}
        title={
          <>
            Who needs a <span className="scribble">second look</span>, and why
          </>
        }
      >
        <Link href={href('/handover')} className="btn btn-primary">
          Build the shift handover <span aria-hidden="true">→</span>
        </Link>
      </PageTitle>

      {q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {q.data ? (
                <>
                  <Stat value={q.data.counts.open} label={`open of ${q.data.counts.residents} residents`} />
                  <Stat value={q.data.counts.persistent} label="persistent" color="var(--color-persistent)" />
                  <Stat value={q.data.counts.unverified + q.data.counts.new_signals} label="unverified or unanswered" color="var(--color-unverified)" />
                  <Stat value={q.data.counts.ambiguous} label="ambiguous" color="var(--color-ambiguous)" />
                </>
              ) : (
                Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-[82px]" />)
              )}
            </div>

            <fieldset className="flex flex-wrap items-center gap-2">
              <legend className="sr-only">Filter the queue</legend>
              <select className="input w-auto" value={domain} onChange={(e) => setDomain(e.target.value)} aria-label="Concern">
                <option value="all">All concerns</option>
                <option value="hydration">Fluid intake</option>
                <option value="mobility">Mobility</option>
              </select>
              <select className="input w-auto" value={state} onChange={(e) => setState(e.target.value as 'all' | State)} aria-label="State">
                {STATE_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select className="input w-auto" value={wing} onChange={(e) => setWing(e.target.value)} aria-label="Wing">
                <option value="all">Both wings</option>
                <option value="Maple">Maple wing</option>
                <option value="Birch">Birch wing</option>
              </select>
              {q.data && (
                <span className="text-[14px] text-ink-3">
                  Showing {items.length} of {q.data.items.length}
                </span>
              )}
            </fieldset>

            {q.isPending ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="panel p-5">
                    <Skeleton lines={4} />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <Empty title={q.data?.items.length ? 'Nothing matches these filters.' : 'No open concern threads.'}>
                {q.data?.items.length ? 'Clear a filter to see the rest of the queue.' : 'Every thread is verified or still inside its follow-up window.'}
              </Empty>
            ) : (
              <ol className="space-y-4" aria-label="Concern threads in review order">
                {items.map((t) => (
                  <li key={t.thread_id}>
                    <QueueCard t={t} rank={q.data!.items.indexOf(t) + 1} now={now} href={threadHref(t.thread_id)} />
                  </li>
                ))}
              </ol>
            )}
          </div>

          <aside className="space-y-5" aria-label="Context">
            <Sticky tilt={0.8}>
              <p className="font-bold">Ranked by reason, not by score.</p>
              <p className="mt-1 text-[14px]">
                Recurring signals first, then signals nobody has answered, then responses whose outcome isn’t recorded, then
                unclear evidence. A documented action is never treated as a resolved concern.
              </p>
            </Sticky>

            <Panel title="Unlinked evidence" aside={<span className="text-[13px] text-ink-3">needs a person</span>}>
              {q.data?.unlinked.length ? (
                <ul className="space-y-3">
                  {q.data.unlinked
                    .filter((u, i, all) => all.findIndex((x) => x.event.source_id === u.event.source_id && x.event.span?.start === u.event.span?.start) === i)
                    .map((u) => (
                    <li key={u.event.event_id} className="text-[14px]">
                      <p className="note-paper">“{u.event.span?.text ?? u.event.summary}”</p>
                      <p className="mt-1 text-ink-2">
                        In {displayName(u.resident)}’s note, {when(u.event.event_time)}. {u.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">{q.isPending ? 'Loading…' : 'Nothing left unlinked.'}</p>
              )}
            </Panel>

            <Panel title="Watching" aside={<span className="text-[13px] text-ink-3">inside follow-up window</span>}>
              {q.data?.watching.length ? (
                <ul className="divide-y-2 divide-dashed divide-line-soft">
                  {q.data.watching.map((t) => (
                    <CompactRow key={t.thread_id} t={t} href={threadHref(t.thread_id)} />
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">{q.isPending ? 'Loading…' : 'None right now.'}</p>
              )}
            </Panel>

            <Panel title="Closed" aside={<span className="text-[13px] text-ink-3">met the demonstration rule</span>}>
              {q.data?.closed.length ? (
                <ul className="divide-y-2 divide-dashed divide-line-soft">
                  {q.data.closed.map((t) => (
                    <CompactRow key={t.thread_id} t={t} href={threadHref(t.thread_id)} />
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">{q.isPending ? 'Loading…' : 'None yet.'}</p>
              )}
            </Panel>
          </aside>
        </div>
      )}
    </>
  )
}
