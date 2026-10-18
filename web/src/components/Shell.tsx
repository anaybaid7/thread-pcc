'use client'

import { when } from '@thread/engine'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useDemo } from '@/lib/demo'
import { STATIC, useWard } from '@/lib/ward'

const NAV = [
  { href: '/', n: '', label: 'Relay', demo: 'nav-home' },
  { href: '/spot/', n: '1', label: 'Spot it', demo: 'nav-spot' },
  { href: '/size/', n: '2', label: 'Size it up', demo: 'nav-size' },
  { href: '/handover/', n: '3', label: 'Carry it forward', demo: 'nav-handover' },
]

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const { ward, mode, error, health, practise, dismiss, reset, busy } = useWard()
  const demo = useDemo()
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href.replace(/\/$/, '')))
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-stretch gap-x-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 py-3" aria-label="THREAD home">
            <span className="font-mono text-[15px] font-medium tracking-[0.18em]">THREAD</span>
            <span className="hidden text-[12.5px] text-ink-3 sm:inline">Birch wing</span>
          </Link>
          <nav aria-label="Workflows" className="flex flex-wrap">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-demo={n.demo}
                aria-current={active(n.href) ? 'page' : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-3 text-[13.5px] font-medium ${active(n.href) ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}
              >
                {n.n && <span className="font-mono text-[11px] text-ink-3">{n.n}</span>}
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3 py-2 text-[12.5px]">
            {ward && (
              <span className="font-mono text-[13px] font-medium tabular-nums" title="Ward clock">
                {when(ward.now)}
              </span>
            )}
            <span className={mode === 'saved' ? 'text-good' : 'text-mid'}>
              {mode === 'saved' ? `Saved · ${health?.database.provider === 'vultr' ? 'Vultr PostgreSQL' : health?.database.provider === 'pglite' ? 'local DB' : 'PostgreSQL'}` : 'Practice · this browser'}
              {mode === 'saved' && health?.gemini.configured ? ' · Gemini on' : ''}
            </span>
            <button type="button" className="btn" onClick={() => void reset()} disabled={busy || demo.running}>
              Reset demo
            </button>
            {demo.running ? (
              <button type="button" className="btn" onClick={demo.stop}>
                Stop
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void demo.start()} disabled={!ward}>
                Play the demo
              </button>
            )}
          </div>
        </div>
      </header>
      {error && (
        <div role="alert" className="border-b border-poor/30 bg-poor-soft">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-4 py-2 text-[13.5px] sm:px-6">
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
      <main id="main" className={`mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 sm:px-6 ${demo.running ? 'pb-28' : ''}`}>
        {ward ? children : <output className="card block p-6 text-ink-3">Opening the ward…</output>}
      </main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto max-w-[1280px] px-4 py-3 text-[12.5px] text-ink-3 sm:px-6">
          <b className="font-medium text-ink-2">Prototype, synthetic data.</b> Fictional residents and staff; ranges are illustrative. Not clinical advice and not a
          substitute for staff assessment or facility procedures. <Link className="link" href="/rationale/">Why it works this way</Link>
        </p>
      </footer>
    </div>
  )
}
