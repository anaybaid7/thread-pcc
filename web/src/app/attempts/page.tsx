'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ApiError, server, STATIC } from '@/lib/sim'

type Row = Awaited<ReturnType<typeof server.list>>['attempts'][number]

const PHASE: Record<string, string> = {
  prebrief: 'Not started',
  playing: 'In progress',
  decision: 'Waiting for a decision',
  handover: 'Writing the handover',
  complete: 'Complete',
}

export default function Attempts() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (STATIC) return
    server
      .list()
      .then((r) => setRows(r.attempts))
      .catch((e: ApiError) => setError(e.message))
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Saved in PostgreSQL</p>
        <h1 className="mt-1 text-[30px]">Past attempts</h1>
        <p className="mt-1 max-w-[65ch] text-[14.5px] text-ink-2">
          Every attempt is kept as it was played: the events revealed, each decision with the evidence available at the time, the scores and the handover.
          Replays are separate attempts. Which version of the day an attempt followed is shown once it is complete.
        </p>
      </div>
      {STATIC ? (
        <p className="card p-5 text-[14.5px] text-ink-2">
          This preview runs in practice mode, so nothing is saved. Run THREAD with its server to keep attempts in PostgreSQL.
        </p>
      ) : error ? (
        <p role="alert" className="card border-2 border-poor/50 p-5 text-[14.5px]">
          {error}
        </p>
      ) : !rows ? (
        <output className="card block animate-pulse p-5 text-ink-3">Loading…</output>
      ) : rows.length === 0 ? (
        <p className="card p-5 text-[14.5px] text-ink-2">
          No attempts yet. <Link href="/play?scenario=evelyn" className="link">Play Evelyn’s day</Link>.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="border-b border-line text-[12.5px] text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Started</th>
                <th className="px-4 py-2.5 font-semibold">Scenario</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Version of the day</th>
                <th className="px-4 py-2.5 text-right font-semibold">Score</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {new Date(r.created_at).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}
                    {r.replay_of && <span className="chip ml-2 text-ink-3">replay</span>}
                  </td>
                  <td className="px-4 py-3">{r.title}</td>
                  <td className="px-4 py-3">
                    {PHASE[r.phase] ?? r.phase}
                    <span className="block text-[12.5px] text-ink-3">{r.decisions} decision{r.decisions === 1 ? '' : 's'}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{r.course ? (r.course === 'persist' ? 'The change persists' : r.course === 'resolve' ? 'The change resolves' : r.course) : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">{r.total_score ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/play?attempt=${r.id}`} className="link whitespace-nowrap">
                      {r.phase === 'complete' ? 'Open debrief' : 'Continue'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
