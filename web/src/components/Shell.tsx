'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { STATIC } from '@/lib/sim'

const NAV = [
  { href: '/', label: 'Simulation' },
  ...(STATIC ? [] : [{ href: '/attempts/', label: 'Past attempts' }]),
  { href: '/rationale/', label: 'Why' },
]

function Mark() {
  // A thread running through three moments: usual, change, follow-up.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <path d="M2 17c4 0 5-8 9-8s4 10 8 10 4-6 5-6" fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="11" cy="9" r="2.6" fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth="2" />
      <circle cx="19" cy="19" r="2.6" fill="var(--color-accent)" />
    </svg>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname()
  const active = (href: string) => (href === '/' ? path === '/' || path.startsWith('/play') : path.startsWith(href.replace(/\/$/, '')))
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="THREAD home">
            <Mark />
            <span className="font-serif text-[20px] font-semibold tracking-tight">THREAD</span>
            <span className="hidden text-[13px] text-ink-3 md:inline">Off Day or Something More?</span>
          </Link>
          <nav aria-label="Main" className="ml-auto flex flex-wrap gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1.5 text-[14px] font-medium ${active(n.href) ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-sunken'}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-[1240px] px-4 py-5 text-[13px] text-ink-3 sm:px-6">
          <p>
            <b className="text-ink-2">Training prototype · synthetic data.</b> Fictional residents and staff. Not validated, not clinical advice, not a
            substitute for staff assessment or facility procedures. Built for PointClickCare’s Catch It Early challenge.
          </p>
        </div>
      </footer>
    </div>
  )
}
