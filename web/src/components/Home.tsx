'use client'

import { SCENARIOS, type Scenario } from '@thread/engine'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { KindMark } from './sim/EventTimeline'
import { DimIcon } from './sim/ResidentCard'
import { BinIcon } from './sim/SortBoard'
import { useTilt } from './motion'

const ForkScene = dynamic(() => import('./three/ForkScene'), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-2xl bg-sunken/50" /> })

const LOOP: [React.ReactNode, string][] = [
  [<span key="1" className="text-[17px] text-accent">◎</span>, 'Baseline'],
  [<KindMark key="2" kind="observation" size={20} />, 'Change'],
  [<BinIcon key="3" tag="unknown" size={20} />, 'Evidence'],
  [<span key="4" className="text-[16px] text-accent">◆</span>, 'Decide'],
  [<span key="5" className="text-[16px] text-poor">↘</span>, 'Consequence'],
  [<span key="6" className="text-[16px] text-good">✓</span>, 'Debrief'],
  [<span key="7" className="text-[17px] text-accent">↺</span>, 'Replay'],
]

const RUBRIC: [string, number, string][] = [
  ['Noticed the change', 30, 'var(--color-accent)'],
  ['Acted on it', 30, 'var(--color-mobility)'],
  ['Fact vs. guess', 25, 'var(--color-mid)'],
  ['Handover', 15, 'var(--color-engagement)'],
]

function ScenarioCard({ s, main }: { s: Scenario; main: boolean }) {
  const { ref, onPointerMove, onPointerLeave } = useTilt<HTMLAnchorElement>(6)
  const initials = s.resident.name
    .split(' ')
    .map((p) => p[0])
    .join('')
  return (
    <Link
      href={`/play/?scenario=${s.id}`}
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`tilt card group flex flex-col gap-3 p-5 ${main ? 'border-2 border-accent/50' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-[#cfe3e1] font-serif text-[18px] font-semibold text-accent-strong" aria-hidden="true">
          {initials}
        </span>
        <span>
          <b className="block font-serif text-[19px] leading-tight">{s.title}</b>
          <span className="text-[13px] text-ink-3">{s.resident.name}</span>
        </span>
      </div>
      <div className="flex gap-1.5" aria-hidden="true">
        {s.dimensions.map((d) => (
          <span key={d.key} className="grid size-8 place-items-center rounded-lg bg-sunken">
            <DimIcon dim={d.key} size={17} />
          </span>
        ))}
      </div>
      <span className={`mt-auto inline-flex items-center gap-1 self-start rounded-lg px-3 py-1.5 text-[14px] font-semibold transition-transform group-hover:translate-x-1 ${main ? 'bg-accent text-white' : 'bg-sunken text-ink'}`}>
        Play →
      </span>
    </Link>
  )
}

export function Home() {
  const [main] = SCENARIOS
  return (
    <div className="space-y-12">
      <section className="relative grid items-center gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="relative z-10">
          <p className="eyebrow text-accent">Long-term-care training simulation</p>
          <h1 className="mt-3 text-[44px] leading-[1.02] sm:text-[58px]">
            Off day, or <span className="text-accent">something more?</span>
          </h1>
          <p className="mt-4 max-w-[40ch] text-[18px] text-ink-2">Notice change against her usual. Decide with what you know. Hand it over clearly.</p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={`/play/?scenario=${main!.id}`} className="btn btn-primary btn-lg pop shadow-lg shadow-accent/20">
              Start with Evelyn →
            </Link>
            <span className="text-[13px] text-ink-3">~8 min · no sign-in</span>
          </div>
        </div>
        <div className="relative h-[300px] rounded-3xl bg-gradient-to-br from-surface via-surface to-accent-soft/60 shadow-[inset_0_0_0_1px_var(--color-line)] sm:h-[380px]">
          <ForkScene />
          <span className="pointer-events-none absolute bottom-3 left-4 text-[11.5px] text-ink-3">drag to turn</span>
        </div>
      </section>

      <section aria-label="The loop">
        <ol className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {LOOP.map(([icon, t], i) => (
            <li key={t} className="pop flex flex-col items-center gap-1.5 rounded-xl bg-surface p-3 text-center shadow-[inset_0_0_0_1px_var(--color-line)]" style={{ animationDelay: `${i * 70}ms` }}>
              <span className="grid size-9 place-items-center rounded-full bg-sunken" aria-hidden="true">
                {icon}
              </span>
              <span className="text-[12.5px] font-semibold">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="scenarios-title">
        <h2 id="scenarios-title" className="text-[24px]">
          Three residents
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {SCENARIOS.map((s, i) => (
            <ScenarioCard key={s.id} s={s} main={i === 0} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" aria-label="Scoring and build">
        <div className="card p-5">
          <h2 className="text-[20px]">100 points, every one explained</h2>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full" aria-hidden="true">
            {RUBRIC.map(([l, n, c]) => (
              <span key={l} style={{ width: `${n}%`, background: c }} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {RUBRIC.map(([l, n, c]) => (
              <li key={l} className="flex items-center gap-2 text-[13.5px]">
                <span className="size-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />
                <b className="tabular-nums">{n}</b> {l}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12.5px] text-ink-3">No points for naming a diagnosis or a dramatic ending.</p>
        </div>
        <div className="card p-5">
          <h2 className="text-[20px]">Under the hood</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ['◆', 'Deterministic engine', 'same choice, same outcome'],
              ['▤', 'PostgreSQL on Vultr', 'every attempt saved'],
              ['✦', 'Gemini', 'drafts the handover only'],
            ].map(([i, t, d]) => (
              <li key={t} className="rounded-xl bg-sunken/70 p-3">
                <span className="text-[18px] text-accent" aria-hidden="true">
                  {i}
                </span>
                <b className="mt-1 block text-[13.5px]">{t}</b>
                <span className="text-[12.5px] text-ink-3">{d}</span>
              </li>
            ))}
          </ul>
          <Link href="/rationale/" className="link mt-3 inline-block text-[13.5px]">
            Why it’s built this way →
          </Link>
        </div>
      </section>
    </div>
  )
}
