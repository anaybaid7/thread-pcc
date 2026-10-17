import type { ReactNode } from 'react'
import { STATE_META } from '@/lib/format'
import type { State } from '@/lib/types'

export function StateChip({ state, short = false }: { state: State; short?: boolean }) {
  const m = STATE_META[state]
  return (
    <span className="chip" style={{ color: m.color, background: m.soft }} title={m.blurb}>
      <StateGlyph state={state} />
      {short ? m.short : m.label}
    </span>
  )
}

/** A small hand-drawn mark per state, so state never depends on colour alone. */
export function StateGlyph({ state, size = 12 }: { state: State; size?: number }) {
  const s = size
  const common = { width: s, height: s, viewBox: '0 0 12 12', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const }
  switch (state) {
    case 'persistent_signal':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.4" />
          <circle cx="6" cy="6" r="1.6" fill="currentColor" />
        </svg>
      )
    case 'new_signal':
      return (
        <svg {...common}>
          <path d="M6 1.5v5.5M6 9.6v.6" />
        </svg>
      )
    case 'unverified':
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="4.4" strokeDasharray="2 1.8" />
        </svg>
      )
    case 'ambiguous':
      return (
        <svg {...common}>
          <path d="M4 4.3a2.1 2.1 0 1 1 2.6 2c-.5.2-.6.5-.6 1.1M6 9.8v.4" />
        </svg>
      )
    case 'response_documented':
      return (
        <svg {...common}>
          <path d="M2 6h6.5M6.2 3.5 8.8 6 6.2 8.5" />
        </svg>
      )
    case 'outcome_verified':
      return (
        <svg {...common}>
          <path d="M2.2 6.4 4.8 9l5-6" />
        </svg>
      )
  }
}

export function PageTitle({ title, kicker, children }: { title: ReactNode; kicker?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <div className="label mb-1">{kicker}</div>}
        <h1 className="text-[28px] sm:text-[32px]">{title}</h1>
      </div>
      {children}
    </div>
  )
}

export function Panel({
  title,
  aside,
  children,
  className = '',
  tone,
}: {
  title?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  tone?: string
}) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`} style={tone ? { background: tone } : undefined}>
      {(title || aside) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-[18px]">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Sticky({ children, className = '', tilt = -0.6 }: { children: ReactNode; className?: string; tilt?: number }) {
  return (
    <div className={`sticky-note ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>
      {children}
    </div>
  )
}

export function Skeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton h-5" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  const offline = message.includes('Failed to fetch') || message.includes('(500)') || message.includes('(502)')
  return (
    <div role="alert" className="panel p-4" style={{ background: 'var(--color-persistent-soft)' }}>
      <p className="font-bold">Couldn’t load this.</p>
      <p className="text-ink-2">
        {offline ? 'The THREAD API is not answering. Start it with make api (or make dev) and try again.' : message}
      </p>
      {retry && (
        <button className="btn btn-sm mt-3" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="hatch rounded-md border-2 border-dashed border-line-soft p-6 text-center">
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 text-ink-2">{children}</div>}
    </div>
  )
}

export function Stat({ value, label, color, hint }: { value: number | string; label: string; color?: string; hint?: string }) {
  return (
    <div className="panel px-4 py-3" title={hint}>
      <div className="text-[34px] leading-none font-bold" style={{ color }}>
        {value}
      </div>
      <div className="mt-1 text-[14px] text-ink-2">{label}</div>
    </div>
  )
}
