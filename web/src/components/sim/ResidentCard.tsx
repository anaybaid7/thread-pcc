import { possessive, type AttemptView, type Dimension } from '@thread/engine'

export const DIM_COLOR: Record<string, string> = {
  mobility: 'var(--color-mobility)',
  intake: 'var(--color-intake)',
  engagement: 'var(--color-engagement)',
  orientation: 'var(--color-orientation)',
  fluids: 'var(--color-fluids)',
}

export const HAS_ICON = new Set(['mobility', 'intake', 'engagement', 'orientation', 'fluids'])

export function DimIcon({ dim, size = 18 }: { dim: Dimension | string; size?: number }) {
  const c = DIM_COLOR[dim] ?? 'var(--color-ink-3)'
  const common = { fill: 'none', stroke: c, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {dim === 'mobility' ? (
        // rollator
        <>
          <path d="M6 4h6l2 9" {...common} />
          <path d="M8 4l-2 9" {...common} />
          <circle cx="6" cy="15.5" r="1.8" {...common} />
          <circle cx="14.5" cy="15.5" r="1.8" {...common} />
        </>
      ) : dim === 'intake' ? (
        // bowl and spoon
        <>
          <path d="M3 10h14a7 6 0 0 1-14 0z" {...common} />
          <path d="M13 3l-3 7" {...common} />
        </>
      ) : dim === 'orientation' ? (
        // calendar
        <>
          <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" {...common} />
          <path d="M3.5 8.5h13M7 3v3M13 3v3M7.5 12.5l2 1.8 3-3.6" {...common} />
        </>
      ) : dim === 'fluids' ? (
        // cup
        <>
          <path d="M5 5h10l-1.2 11H6.2z" {...common} />
          <path d="M5.6 9.5h8.8" {...common} />
        </>
      ) : (
        // speech
        <>
          <path d="M4 5h12v8H9l-4 3v-3H4z" {...common} />
          <path d="M7 9h6" {...common} />
        </>
      )}
    </svg>
  )
}

export function ResidentCard({ view }: { view: AttemptView }) {
  const r = view.scenario.resident
  const initials = r.name
    .split(' ')
    .map((p) => p[0])
    .join('')
  return (
    <section className="card p-4" aria-labelledby="resident-name">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-[#cfe3e1] font-serif text-[18px] font-semibold text-accent-strong shadow-inner"
        >
          {initials}
        </div>
        <div className="min-w-0">
          <h2 id="resident-name" className="text-[19px]">
            {r.name}
          </h2>
          <p className="text-[13px] text-ink-3">
            {r.age} · Room {r.room} · {r.wing}
          </p>
        </div>
        <span className="chip ml-auto border-dashed text-[11.5px] text-ink-3" title="Fictional resident">
          Synthetic
        </span>
      </div>

      <h3 className="eyebrow mt-4 font-sans">{possessive(r.pronoun)} usual</h3>
      <ul className="mt-2 space-y-1.5">
        {r.baseline.map((b) => (
          <li key={b.id} className="flex items-start gap-2.5 rounded-lg bg-sunken/60 px-2.5 py-2 text-[13.5px] leading-snug">
            <DimIcon dim={b.dimension} />
            <span>{b.text.replace(/^Usually (\w)/, (_, c: string) => c.toUpperCase())}</span>
          </li>
        ))}
      </ul>

      <details className="group mt-3 text-[13.5px]">
        <summary className="cursor-pointer list-none text-[13px] font-medium text-accent">
          <span className="group-open:hidden">About {r.preferredName} ▸</span>
          <span className="hidden group-open:inline">Less ▾</span>
        </summary>
        <p className="mt-2 text-ink-2">{r.summary}</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
          {r.about.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-ink-3">{view.scenario.role}</p>
      </details>
    </section>
  )
}
