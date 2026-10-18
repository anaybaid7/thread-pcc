'use client'

import { SCENARIOS, type Dimension, type Scenario } from '@thread/engine'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { DIM_COLOR } from './sim/ResidentCard'

const ForkScene = dynamic(() => import('./three/ForkScene'), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-2xl bg-sunken/50" /> })

/** Last week's usual, then the first values the scenario reveals: a small, honest preview of each resident's pattern. */
function Sparkline({ s }: { s: Scenario }) {
  const first = Object.values(s.nodes).find((n) => n.id === s.start)!
  const pts: { label: string; values: Partial<Record<Dimension, number>> }[] = [...s.baselineSeries]
  const now: Partial<Record<Dimension, number>> = {}
  for (const e of first.events) Object.assign(now, e.measures ?? {})
  pts.push({ label: 'now', values: now })
  const W = 460
  const H = 56
  const x = (i: number) => 4 + (i / (pts.length - 1)) * (W - 8)
  const y = (v: number) => 6 + (1 - v / 110) * (H - 12)
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a static SVG chart with a text alternative
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full" role="img" aria-label={`${s.resident.preferredName}: last week around usual, then a drop on the first day.`}>
      <rect x={0} y={y(115)} width={W} height={y(85) - y(115)} fill="var(--color-accent)" opacity={0.07} />
      <line x1={x(pts.length - 2) + (x(1) - x(0)) / 2} x2={x(pts.length - 2) + (x(1) - x(0)) / 2} y1={2} y2={H - 2} stroke="var(--color-line-strong)" strokeDasharray="2 3" />
      {s.dimensions.map((d) => {
        const line = pts.map((p, i) => (p.values[d.key] == null ? null : `${x(i)},${y(p.values[d.key]!)}`)).filter(Boolean)
        return (
          <g key={d.key}>
            <polyline points={line.join(' ')} fill="none" stroke={DIM_COLOR[d.key]} strokeWidth={1.6} strokeLinejoin="round" />
            {now[d.key] != null && <circle cx={x(pts.length - 1)} cy={y(now[d.key]!)} r={2.6} fill={DIM_COLOR[d.key]} />}
          </g>
        )
      })}
    </svg>
  )
}

function ScenarioCard({ s, main }: { s: Scenario; main: boolean }) {
  return (
    <Link href={`/play/?scenario=${s.id}`} className={`card group flex flex-col gap-3 p-5 transition-colors hover:border-ink/40 ${main ? 'border-ink/30' : ''}`}>
      <div>
        <p className="eyebrow">{s.resident.name}</p>
        <h3 className="mt-1 text-[20px] leading-tight">{s.title}</h3>
      </div>
      <Sparkline s={s} />
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {s.dimensions.map((d) => (
          <li key={d.key} className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3" style={{ background: DIM_COLOR[d.key] }} />
            {d.label}
          </li>
        ))}
      </ul>
      <span className="mt-auto text-[14px] font-semibold text-accent group-hover:underline">Play scenario</span>
    </Link>
  )
}

const RUBRIC: [string, number, string][] = [
  ['Recognising change from baseline', 30, 'var(--color-accent)'],
  ['Communication and action', 30, 'var(--color-mobility)'],
  ['Facts vs. assumptions vs. unknowns', 25, 'var(--color-mid)'],
  ['Handover clarity', 15, 'var(--color-engagement)'],
]

export function Home() {
  const [main] = SCENARIOS
  return (
    <div className="space-y-14">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div>
          <p className="eyebrow">Long-term-care training simulation</p>
          <h1 className="mt-3 text-[42px] leading-[1.04] sm:text-[54px]">Off day, or something more?</h1>
          <p className="mt-4 max-w-[44ch] text-[17px] text-ink-2">
            Practise the moment that decides early detection: noticing a change against a resident’s usual, separating what you saw from what you assume,
            and telling the right person in time.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href={`/play/?scenario=${main!.id}`} className="btn btn-primary btn-lg">
              Start with Evelyn
            </Link>
            <span className="text-[13px] text-ink-3">About 8 minutes · no sign-in</span>
          </div>
        </div>
        <div className="relative h-[300px] rounded-2xl border border-line bg-surface sm:h-[360px]">
          <ForkScene />
          <span className="pointer-events-none absolute bottom-3 left-4 text-[11.5px] text-ink-3">Same Monday, two possible Tuesdays · drag to rotate</span>
        </div>
      </section>

      <section aria-labelledby="scenarios-title">
        <div className="flex items-end justify-between gap-3">
          <h2 id="scenarios-title" className="text-[24px]">
            Scenarios
          </h2>
          <p className="text-[12.5px] text-ink-3">Lines: last week against the first day. Band: usual range.</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {SCENARIOS.map((s, i) => (
            <ScenarioCard key={s.id} s={s} main={i === 0} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-label="Assessment and build">
        <div className="card p-5">
          <h2 className="text-[19px]">How attempts are scored</h2>
          <div className="mt-4 flex h-3 overflow-hidden rounded-sm" aria-hidden="true">
            {RUBRIC.map(([l, n, c]) => (
              <span key={l} className="border-r-2 border-surface last:border-r-0" style={{ width: `${n}%`, background: c }} />
            ))}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {RUBRIC.map(([l, n, c]) => (
              <li key={l} className="flex items-center gap-2 text-[13.5px]">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: c }} aria-hidden="true" />
                <span className="flex-1">{l}</span>
                <b className="font-mono tabular-nums">{n}</b>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-ink-3">Every decision is scored on the entries visible when it was made. No points for naming a diagnosis.</p>
        </div>
        <div className="card p-5">
          <h2 className="text-[19px]">Under the hood</h2>
          <dl className="mt-3 space-y-2.5 text-[13.5px]">
            <div className="grid grid-cols-[150px_1fr] gap-3">
              <dt className="font-semibold">Scenario engine</dt>
              <dd className="text-ink-2">Deterministic: the same choices always lead to the same place.</dd>
            </div>
            <div className="grid grid-cols-[150px_1fr] gap-3">
              <dt className="font-semibold">PostgreSQL on Vultr</dt>
              <dd className="text-ink-2">Every attempt, decision and its evidence, saved and immutable.</dd>
            </div>
            <div className="grid grid-cols-[150px_1fr] gap-3">
              <dt className="font-semibold">Gemini</dt>
              <dd className="text-ink-2">Drafts the handover from facts you saw. Checked, never trusted blindly.</dd>
            </div>
          </dl>
          <Link href="/rationale/" className="link mt-3 inline-block text-[13.5px]">
            Design rationale
          </Link>
        </div>
      </section>
    </div>
  )
}
