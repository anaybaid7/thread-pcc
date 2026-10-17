'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Empty, ErrorBox, PageTitle, Panel, Skeleton } from '@/components/ui'
import { get } from '@/lib/api'
import { when } from '@/lib/format'
import { useHref } from '@/lib/hooks'
import type { AuditRow } from '@/lib/types'

const ACTION: Record<string, string> = {
  verify_current_status: 'Verified at bedside',
  mark_reviewed: 'Marked reviewed',
  note_added: 'Note added',
  handover_saved: 'Handover saved',
}

export default function AuditPage() {
  const href = useHref()
  const q = useQuery({ queryKey: ['audit'], queryFn: () => get<AuditRow[]>('/audit') })
  return (
    <>
      <PageTitle kicker="Audit log" title="Everything anyone did, in order" />
      <p className="mb-6 max-w-[760px] text-ink-2">
        Review actions, bedside checks, new notes and saved handovers, with who and when. Concern threads themselves are never
        stored: they are recomputed from the records, so this log plus the records reproduce every screen.
      </p>
      <Panel>
        {q.isError ? (
          <ErrorBox error={q.error} retry={() => q.refetch()} />
        ) : !q.data ? (
          <Skeleton lines={4} />
        ) : q.data.length === 0 ? (
          <Empty title="No actions yet.">Open a concern thread and verify or mark it reviewed; it will appear here.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[14.5px]">
              <thead>
                <tr className="border-b-2 border-ink">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Who</th>
                  <th className="py-2 pr-4">What</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((a) => (
                  <tr key={a.id} className="border-b-2 border-dashed border-line-soft align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{when(a.at)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{a.actor}</td>
                    <td className="py-2 pr-4 font-bold whitespace-nowrap">{ACTION[a.action] ?? a.action}</td>
                    <td className="py-2">
                      {a.detail}{' '}
                      {a.thread_id && (
                        <Link href={href(`/thread?id=${encodeURIComponent(a.thread_id)}`)} className="underline underline-offset-4">
                          thread
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  )
}
