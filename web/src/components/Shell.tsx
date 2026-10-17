'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { STATIC } from '@/lib/api'
import { when } from '@/lib/format'
import { useAsOf, useHref, useMeta } from '@/lib/hooks'
import { Logo } from './Logo'

const NAV = [
  { href: '/', label: 'Needs review' },
  { href: '/handover', label: 'Shift handover' },
  { href: '/lab', label: 'Note lab' },
  { href: '/evaluation', label: 'Evaluation' },
  { href: '/audit', label: 'Audit log' },
  { href: '/method', label: 'How it works' },
]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const href = useHref()
  const meta = useMeta()
  const [asOf, setAsOf] = useAsOf()
  const m = meta.data
  const current = asOf ?? m?.now ?? ''
  const isNow = !asOf || asOf === m?.now

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-surface focus:p-2">
        Skip to content
      </a>
      <header className="no-print border-b-2 border-ink bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link href={href('/')} className="flex items-center gap-2.5 no-underline" aria-label="THREAD home">
            <Logo />
            <span>
              <span className="block text-[24px] leading-none font-bold tracking-[0.12em]">THREAD</span>
              <span className="block text-[12px] text-ink-3">Resident concern threads</span>
            </span>
          </Link>

          <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-4 gap-y-2 text-[14px] md:basis-auto">
            <span className="text-ink-2">
              <span className="font-bold text-ink">{m?.facility ?? 'Valleyview Commons'}</span>
              <span className="hidden sm:inline"> · Maple & Birch wings</span>
            </span>
            <label className="flex items-center gap-2">
              <span className="text-ink-3">Viewing</span>
              <select
                className="input w-auto max-w-[min(15rem,calc(100vw-7rem))] py-0.5 pr-7 text-[14px]"
                value={current}
                onChange={(e) => setAsOf(e.target.value === m?.now ? null : e.target.value)}
                aria-label="Point in time to view"
              >
                {(m?.checkpoints ?? []).map((c) => (
                  <option key={c.at} value={c.at}>
                    {c.label}
                  </option>
                ))}
                {!m && <option value="">Tue 09:00 (now)</option>}
              </select>
            </label>
            {!isNow && m && (
              <button className="btn btn-sm" onClick={() => setAsOf(null)}>
                Back to now ({when(m.now)})
              </button>
            )}
          </div>

          <div className="sticky-note px-3 py-1 text-[13px] font-bold" style={{ transform: 'rotate(1.5deg)' }}>
            SYNTHETIC DATA · not a clinical system
          </div>
        </div>
        <nav aria-label="Main" className="mx-auto max-w-[1240px] overflow-x-auto px-4 sm:px-6">
          <ul className="flex gap-1">
            {NAV.map((n) => {
              const active = n.href === '/' ? pathname === '/' || pathname.startsWith('/thread') : pathname.startsWith(n.href)
              return (
                <li key={n.href}>
                  <Link
                    href={href(n.href)}
                    aria-current={active ? 'page' : undefined}
                    className={`-mb-0.5 block border-2 border-b-0 px-3.5 py-1.5 text-[15px] whitespace-nowrap no-underline ${
                      active ? 'rounded-t-md border-ink bg-paper font-bold' : 'border-transparent text-ink-2 hover:text-ink'
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      </header>

      {!isNow && m && (
        <div className="no-print border-b-2 border-dashed border-ink bg-sticky px-4 py-2 text-center text-[14px]">
          Replaying <b>{m.checkpoints.find((c) => c.at === asOf)?.label ?? when(current)}</b>: only what had been entered by
          then is shown.
        </div>
      )}
      {STATIC && (
        <div className="no-print border-b-2 border-dashed border-line-soft bg-accent-soft px-4 py-1.5 text-center text-[13.5px]">
          Static preview on GitHub Pages: the engine ran at build time. Run it locally (<code>make dev</code>) to record
          actions and paste your own notes.
        </div>
      )}

      <main id="main" className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="no-print mx-auto max-w-[1240px] px-4 pb-10 text-[13px] text-ink-3 sm:px-6">
        THREAD surfaces concerns whose resolution the records do not yet establish. It does not diagnose, predict or
        recommend treatment. All residents, staff and notes are fictional.
      </footer>
    </div>
  )
}
