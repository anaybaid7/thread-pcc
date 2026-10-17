import Link from 'next/link'
import { ago, displayName, STATE_META, when } from '@/lib/format'
import type { ThreadSummary } from '@/lib/types'
import { ShiftTrail } from './ShiftTrail'
import { StateChip } from './ui'

const QUIET = new Set(['crossed_shifts', 'within_window', 'outcome_met_rule'])

export function QueueCard({ t, rank, now, href }: { t: ThreadSummary; rank?: number; now: string; href: string }) {
  const m = STATE_META[t.state]
  const c = t.counts
  const evidence = [
    `${c.signals} signal${c.signals === 1 ? '' : 's'}`,
    `${c.responses} response${c.responses === 1 ? '' : 's'}`,
    c.plans ? `${c.plans} plan${c.plans === 1 ? '' : 's'}` : null,
    c.gaps ? `${c.gaps} evidence gap${c.gaps === 1 ? '' : 's'}` : null,
  ].filter(Boolean)
  return (
    <article className="panel flex gap-0 overflow-hidden" aria-labelledby={`q-${t.thread_id}`}>
      <div className="w-2 shrink-0" style={{ background: m.color }} aria-hidden="true" />
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-baseline gap-3">
            {rank != null && (
              <span className="text-[26px] leading-none font-bold text-ink-3" aria-label={`Review order ${rank}`}>
                {rank}
              </span>
            )}
            <div className="min-w-0">
              <h3 id={`q-${t.thread_id}`} className="text-[19px]">
                {displayName(t.resident)}
              </h3>
              <p className="text-[14px] text-ink-2">
                Room {t.resident.room} · {t.resident.wing} wing · <b className="text-ink">{t.domain_label}</b> · open since{' '}
                {when(t.first_seen)}
              </p>
            </div>
          </div>
          <StateChip state={t.state} />
        </div>

        <p className="mt-3 text-[16px] font-bold">{t.review_reason}</p>
        {t.headline && <p className="mt-1 text-ink-2">{t.headline}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.reasons
            .filter((r) => !QUIET.has(r.code))
            .map((r) => (
              <span key={r.code} className="tag">
                {r.label}
              </span>
            ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t-2 border-dashed border-line-soft pt-3">
          <div className="space-y-1">
            <ShiftTrail shifts={t.shifts_spanned} />
            <p className="text-[13px] text-ink-3">
              {evidence.join(' · ')} · last signal {when(t.last_signal_at)} ({ago(t.last_signal_at, now)} ago)
            </p>
            {t.last_reviewed && (
              <p className="text-[13px] text-ink-2">
                ✓ Reviewed by {t.last_reviewed.actor} at {when(t.last_reviewed.timestamp)}. Still open: reviewing is not
                resolving.
              </p>
            )}
          </div>
          <Link href={href} className="btn">
            Open concern thread <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

export function CompactRow({ t, href }: { t: ThreadSummary; href: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <Link href={href} className="font-bold underline decoration-line-soft decoration-2 underline-offset-4 hover:decoration-ink">
          {displayName(t.resident)}
        </Link>
        <span className="text-ink-2">
          {' '}
          · {t.domain_label} · Room {t.resident.room}
        </span>
        <p className="text-[14px] text-ink-2">{t.review_reason}</p>
      </div>
      <StateChip state={t.state} short />
    </li>
  )
}
