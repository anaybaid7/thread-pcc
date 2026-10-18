'use client'

import type { AttemptView } from '@thread/engine'
import { DIM_COLOR, DimIcon } from './ResidentCard'

/** Deviation from the resident's usual, cell by cell: rows are areas, columns are days and shifts. */
function cell(v: number | undefined) {
  if (v == null) return { bg: 'transparent', fg: 'var(--color-ink-3)' }
  const dev = Math.max(0, Math.min(1, (100 - v) / 85))
  if (v >= 85) return { bg: `rgb(14 90 97 / ${0.06 + (v >= 95 ? 0.06 : 0)})`, fg: 'var(--color-ink-2)' }
  // Light fills with dark text keep every cell readable (WCAG AA); depth of colour carries the size of the drop.
  if (v >= 50) return { bg: `rgb(163 97 26 / ${0.12 + dev * 0.2})`, fg: 'var(--color-ink)' }
  return { bg: `rgb(168 52 52 / ${0.16 + dev * 0.22})`, fg: 'var(--color-ink)' }
}

export function PatternHeatmap({ view }: { view: AttemptView }) {
  const pts = view.chart
  const dims = view.scenario.dimensions
  const firstObs = pts.findIndex((p) => p.phase === 'observed')
  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG: a region that scrolls must be reachable by keyboard
    <section className="overflow-x-auto px-4 pt-2 pb-3 sm:px-5" tabIndex={0} aria-label="Deviation heatmap, scrolls sideways">
      <table className="w-full min-w-max border-separate border-spacing-px" aria-label="Deviation from usual by area and time. 100 is usual.">
        <thead>
          <tr>
            <th scope="col" className="w-[140px] pb-1 text-left text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
              vs. usual
            </th>
            {pts.map((p, i) => (
              <th
                key={p.key}
                scope="col"
                className={`min-w-[44px] pb-1 text-center text-[11px] leading-tight ${p.phase === 'observed' ? 'font-semibold text-ink' : 'font-normal text-ink-3'} ${i === firstObs ? 'border-l-2 border-ink' : ''}`}
              >
                {p.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dims.map((d) => (
            <tr key={d.key}>
              <th scope="row" className="py-2 pr-2 text-left text-[13px] font-semibold whitespace-nowrap" style={{ color: DIM_COLOR[d.key] }}>
                <span className="inline-flex items-center gap-2">
                  <DimIcon dim={d.key} size={16} />
                  {d.label}
                </span>
              </th>
              {pts.map((p, i) => {
                const v = p.values[d.key]
                const c = cell(v)
                return (
                  <td
                    key={p.key}
                    title={v == null ? `${d.label} · ${p.label}: no entry` : `${d.label} · ${p.label}: ${v}${p.notes[d.key] ? ` · ${p.notes[d.key]}` : ''}`}
                    className={`h-10 text-center font-mono text-[12.5px] tabular-nums ${i === firstObs ? 'border-l-2 border-ink' : ''}`}
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {v ?? '·'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: cell(100).bg }} /> usual (85+)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: cell(65).bg }} /> below usual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: cell(25).bg }} /> well below
        </span>
        <span>Illustrative index, 100 = usual. Not a clinical measure.</span>
      </div>
    </section>
  )
}
