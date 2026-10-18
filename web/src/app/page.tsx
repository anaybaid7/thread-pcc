'use client'

import { board, deriveConcerns, handover, offerFlags, resident } from '@thread/engine'
import Link from 'next/link'
import { useWard } from '@/lib/ward'

const FLOWS = [
  {
    href: '/spot/',
    n: 1,
    title: 'Spot it',
    who: 'PSW · 20 seconds',
    line: 'Check a resident against their own usual. Send what is different; what you didn’t check is listed, not assumed.',
    steps: ['Open Evelyn', 'Mark what’s different', 'Send to the nurse'],
  },
  {
    href: '/size/',
    n: 2,
    title: 'Size it up',
    who: 'Charge nurse · 2 minutes',
    line: 'See who needs you first, and why. Check what nobody knows yet against the resident’s own ranges, then watch or escalate.',
    steps: ['Open the top report', 'Check an unknown', 'Watch with a recheck, or escalate'],
  },
  {
    href: '/handover/',
    n: 3,
    title: 'Carry it forward',
    who: 'Shift change · 1 minute',
    line: 'Every open loop goes to the next shift: overdue rechecks, unseen reports, drinks offered but never measured. Each one must be taken on.',
    steps: ['Move to 15:00', 'Read what’s flagged', 'Take on every item'],
  },
]

export default function Home() {
  const { ward } = useWard()
  const concerns = deriveConcerns(ward!)
  const counts = [
    ['open concerns', concerns.filter((c) => c.status !== 'resolved').length],
    ['overdue rechecks', concerns.filter((c) => c.overdue).length],
    ['unseen reports', concerns.filter((c) => c.status === 'new').length],
    ['offered, never measured', offerFlags(ward!).length],
  ] as const
  const h = handover(ward!)
  return (
    <div className="space-y-8">
      <section className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">Birch wing · long-term care</p>
          <h1 className="mt-2 text-[38px] leading-[1.05] sm:text-[48px]">Catch it early. Then don’t drop it.</h1>
          <p className="mt-3 max-w-[56ch] text-[16px] text-ink-2">
            Early signs are noticed by the people closest to the resident and lost between them. THREAD carries a change from the PSW who sees it, to the
            nurse who checks it, across the shift change, until there is a recorded outcome.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-2">
          {counts.map(([l, n]) => (
            <div key={l} className="card px-4 py-3">
              <dd className="font-serif text-[30px] leading-none font-semibold tabular-nums">{n}</dd>
              <dt className="mt-1 text-[12.5px] text-ink-3">{l}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Workflows" className="grid gap-4 lg:grid-cols-3">
        {FLOWS.map((f) => (
          <Link key={f.href} href={f.href} className="card group flex flex-col gap-3 p-5 transition-colors hover:border-ink/40">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[13px] text-ink-3">0{f.n}</span>
              <span className="text-[12px] font-medium text-ink-3">{f.who}</span>
            </div>
            <h2 className="text-[24px]">{f.title}</h2>
            <p className="text-[14px] text-ink-2">{f.line}</p>
            <ol className="mt-auto space-y-1.5 border-t border-line pt-3 text-[13.5px]">
              {f.steps.map((s, i) => (
                <li key={s} className="flex gap-2">
                  <span className="font-mono text-ink-3">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <span className="text-[14px] font-semibold text-accent group-hover:underline">Start</span>
          </Link>
        ))}
      </section>

      <section className="card p-5">
        <h2 className="text-[17px]">What is waiting on the ward now</h2>
        <ul className="mt-3 divide-y divide-line">
          {board(ward!)
            .filter((b) => b.tone !== 'done')
            .map((b) => (
              <li key={b.key} className="grid gap-1 py-2.5 text-[14px] sm:grid-cols-[200px_200px_1fr]">
                <b>{resident(b.residentId).name}</b>
                <span className={b.tone === 'urgent' ? 'font-semibold text-poor' : 'text-ink-2'}>{b.reason}</span>
                <span className="text-ink-3">{b.detail}</span>
              </li>
            ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Next handover {h.label}. Ordered by explicit reasons, never by a risk score.
        </p>
      </section>
    </div>
  )
}
