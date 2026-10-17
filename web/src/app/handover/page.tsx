'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { CompactRow } from '@/components/QueueCard'
import { Empty, ErrorBox, PageTitle, Panel, Skeleton, StateChip } from '@/components/ui'
import { get, post, STATIC, withAsOf } from '@/lib/api'
import { displayName, when } from '@/lib/format'
import { useAsOf, useHref } from '@/lib/hooks'
import type { Handover, HandoverItem } from '@/lib/types'

function draftText(item: HandoverItem): string {
  const lines = item.sentences.map((s) => `${s.text} [${s.cites.join(', ')}]`)
  return `${lines.join(' ')}\nNext: ${item.next_step}`
}

export default function HandoverPage() {
  const [asOf] = useAsOf()
  const href = useHref()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['handover', asOf], queryFn: () => get<Handover>(withAsOf('/handover', asOf)) })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [author, setAuthor] = useState('RN Priya S.')
  const save = useMutation({
    mutationFn: (h: Handover) =>
      post<{ id: number; saved_at: string }>('/handover', {
        as_of: h.as_of,
        author,
        items: h.items.map((i) => ({ thread_id: i.thread_id, text: edits[i.thread_id] ?? draftText(i) })),
      }),
    onSuccess: () => qc.invalidateQueries(),
  })

  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const h = q.data

  return (
    <>
      <PageTitle
        kicker={h ? `Shift handover · ${h.label}${h.previous_label ? ` · changes since ${h.previous_label}` : ''}` : 'Shift handover'}
        title={
          h ? (
            <>
              {h.items.length} {h.items.length === 1 ? 'thread needs' : 'threads need'} <span className="scribble">verification</span>
            </>
          ) : (
            'Shift handover'
          )
        }
      >
        <div className="no-print flex gap-2">
          <button className="btn" onClick={() => window.print()} disabled={!h}>
            Print
          </button>
        </div>
      </PageTitle>

      <p className="mb-6 max-w-[760px] text-ink-2">
        What the incoming shift should know that could be lost in the notes. Built only from concern threads, ranked by
        reason for review, and every sentence points at its evidence. Edit freely before saving.
      </p>

      {!h ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel p-5">
              <Skeleton lines={4} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {h.items.length === 0 && <Empty title="Nothing needs verification at this point.">Enjoy the quiet shift.</Empty>}
            {h.items.map((item, i) => (
              <article key={item.thread_id} className="panel p-4 sm:p-5" aria-labelledby={`h-${item.thread_id}`}>
                <header className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 id={`h-${item.thread_id}`} className="text-[19px]">
                      <span className="mr-2 text-ink-3">{i + 1}.</span>
                      {displayName(item.resident)} — {item.domain_label}
                    </h2>
                    <p className="text-[14px] text-ink-2">
                      Room {item.resident.room} · {item.resident.wing} · {item.review_reason}
                    </p>
                  </div>
                  <StateChip state={item.state} />
                </header>

                <label className="mt-3 block">
                  <span className="sr-only">Handover text for {item.resident.name}</span>
                  <textarea
                    className="input min-h-[120px] leading-relaxed"
                    style={{ ['fieldSizing' as string]: 'content' }}
                    rows={6}
                    value={edits[item.thread_id] ?? draftText(item)}
                    onChange={(e) => setEdits({ ...edits, [item.thread_id]: e.target.value })}
                  />
                </label>

                {item.new_since.length > 0 && (
                  <div className="mt-3">
                    <p className="label">New since {h.previous_label}</p>
                    <ul className="mt-1 space-y-0.5 text-[14px]">
                      {item.new_since.map((n) => (
                        <li key={n.label}>
                          <b>{n.label}</b> {when(n.time)} · {n.summary} <span className="text-ink-3">({n.author})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="no-print mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-ink-3">Citations [E1]… refer to the evidence on the thread.</span>
                  <Link href={href(`/thread?id=${encodeURIComponent(item.thread_id)}`)} className="btn btn-sm">
                    Open thread →
                  </Link>
                </div>
              </article>
            ))}
            {h.more > 0 && (
              <p className="text-ink-2">
                {h.more} more open {h.more === 1 ? 'thread is' : 'threads are'} in the{' '}
                <Link href={href('/')} className="underline underline-offset-4">
                  review queue
                </Link>
                . The brief stops at five so it stays readable.
              </p>
            )}
          </div>

          <aside className="space-y-5">
            <Panel title="Save this brief" className="no-print">
              <label className="block">
                <span className="label">Signed by</span>
                <input className="input mt-1" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} disabled={STATIC} />
              </label>
              <button className="btn btn-primary mt-3 w-full" disabled={STATIC || save.isPending || !author.trim()} onClick={() => save.mutate(h)}>
                Save handover
              </button>
              <div aria-live="polite" className="mt-2 text-[13.5px]">
                {save.isSuccess && <p style={{ color: 'var(--color-verified)' }}>Saved {when(save.data.saved_at)} and logged in the audit trail.</p>}
                {save.isError && <p style={{ color: 'var(--color-persistent)' }}>{(save.error as Error).message}</p>}
                {!save.isSuccess && h.saved && (
                  <p className="text-ink-2">
                    Last saved by {h.saved.author} at {when(h.saved.saved_at)}.
                  </p>
                )}
                {STATIC && <p className="text-ink-2">Saving is off in the static preview.</p>}
              </div>
            </Panel>
            <Panel title="Watching">
              {h.watching.length ? (
                <ul className="divide-y-2 divide-dashed divide-line-soft">
                  {h.watching.map((t) => (
                    <CompactRow key={t.thread_id} t={t} href={href(`/thread?id=${encodeURIComponent(t.thread_id)}`)} />
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">Nothing inside a follow-up window.</p>
              )}
            </Panel>
            <Panel title="Closed this shift">
              {h.closed.length ? (
                <ul className="divide-y-2 divide-dashed divide-line-soft">
                  {h.closed.map((t) => (
                    <CompactRow key={t.thread_id} t={t} href={href(`/thread?id=${encodeURIComponent(t.thread_id)}`)} />
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">No thread met the rule since the last handover.</p>
              )}
              <p className="mt-2 text-[12.5px] text-ink-3">Closed threads generate no further escalation unless new evidence appears.</p>
            </Panel>
            {h.unlinked > 0 && (
              <Panel title="Also">
                <p className="text-[14.5px]">
                  {h.unlinked} piece{h.unlinked === 1 ? '' : 's'} of evidence could not be linked to a resident’s concern.{' '}
                  <Link href={href('/')} className="underline underline-offset-4">
                    Review them
                  </Link>
                  .
                </p>
              </Panel>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
