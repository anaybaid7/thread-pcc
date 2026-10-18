'use client'

import { board, handover, when } from '@thread/engine'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { STATIC, useWard } from '@/lib/ward'

const NAV = [
  { href: '/spot/', n: 1, label: 'Spot it' },
  { href: '/size/', n: 2, label: 'Size it up' },
  { href: '/handover/', n: 3, label: 'Carry it forward' },
]

function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M2 17c4 0 5-8 9-8s4 10 8 10 4-6 5-6" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="11" cy="9" r="2.6" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="19" cy="19" r="2.6" fill="var(--color-accent)" />
    </svg>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const { ward, mode, error, health, practise, dismiss, reset, busy } = useWard()
  const open = ward ? board(ward).filter((b) => b.tone !== 'done').length : 0
  const h = ward ? handover(ward) : null
  const active = (href: string) => path.startsWith(href.replace(/\/$/, ''))
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex items-center gap-2" aria-label="THREAD home">
            <Mark />
            <span className="font-serif text-[19px] font-semibold">THREAD</span>
          </Link>
          <nav aria-label="Workflows" className="flex flex-wrap gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? 'page' : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13.5px] font-medium ${active(n.href) ? 'bg-ink text-white' : 'text-ink-2 hover:bg-sunken'}`}
              >
                <span className="font-mono text-[11px] opacity-70">{n.n}</span>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[12.5px]">
            {ward && (
              <span className="chip font-mono tabular-nums" title="Demo clock">
                {when(ward.now)}
              </span>
            )}
            {ward && <span className="chip">{open} open</span>}
            {h && h.items.some((i) => !i.ack) && h.open && <span className="chip border-poor/40 text-poor">Handover {when(h.at).slice(4)}</span>}
            <span className={`chip ${mode === 'saved' ? 'border-good/40 text-good' : 'border-mid/40 text-mid'}`}>
              {mode === 'saved' ? `Saved · ${health?.database.provider === 'vultr' ? 'Vultr PostgreSQL' : health?.database.provider === 'pglite' ? 'local DB' : 'PostgreSQL'}` : 'Practice · this browser'}
            </span>
            <button type="button" className="rounded-md px-2 py-1 text-ink-3 hover:bg-sunken hover:text-ink" onClick={() => void reset()} disabled={busy}>
              Reset demo
            </button>
          </div>
        </div>
      </header>
      {error && (
        <div role="alert" className="border-b border-poor/30 bg-poor-soft">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3 px-4 py-2 text-[13.5px] sm:px-6">
            <span className="font-semibold text-poor">{error}</span>
            {!STATIC && mode === 'saved' && /reached|unavailable/.test(error) && (
              <button type="button" className="btn px-2.5 py-1 text-[12.5px]" onClick={practise}>
                Continue in practice mode
              </button>
            )}
            <button type="button" className="ml-auto text-ink-3 hover:text-ink" onClick={dismiss} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      )}
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-5 sm:px-6">
        {ward ? children : <output className="card block animate-pulse p-6 text-ink-3">Opening the ward…</output>}
      </main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-[1240px] px-4 py-4 text-[12.5px] text-ink-3 sm:px-6">
          <b className="text-ink-2">Prototype · synthetic data.</b> Fictional residents and staff; ranges are illustrative. Not clinical advice and not a
          substitute for staff assessment or facility procedures. <Link className="link" href="/rationale/">Why it works this way</Link>
        </p>
      </footer>
    </div>
  )
}
