'use client'

import { STATE_META } from '@/lib/format'
import type { State, Timeline } from '@/lib/types'
import { StateGlyph } from '../ui'

export const CELL: Record<State, { bg: string; fg: string }> = {
  persistent_signal: { bg: 'var(--color-persistent)', fg: 'white' },
  new_signal: { bg: 'var(--color-newsignal)', fg: 'white' },
  unverified: { bg: '#d9b23c', fg: 'var(--color-ink)' },
  ambiguous: { bg: 'var(--color-ambiguous)', fg: 'white' },
  response_documented: { bg: '#a9c2f2', fg: 'var(--color-ink)' },
  outcome_verified: { bg: '#a7d6b1', fg: 'var(--color-ink)' },
}

export const LEGEND: (State | null)[] = [
  'persistent_signal',
  'new_signal',
  'unverified',
  'ambiguous',
  'response_documented',
  'outcome_verified',
  null,
]

export function Swatch({ state, size = 14 }: { state: State | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-[3px] border-[1.5px] border-ink"
      style={{ width: size, height: size, background: state ? CELL[state].bg : 'var(--color-paper)' }}
    />
  )
}

function hourLabel(iso: string) {
  return iso.slice(11, 13)
}

function shiftOf(iso: string) {
  const h = Number(iso.slice(11, 13))
  return h >= 7 && h < 15 ? 'day' : h >= 15 && h < 23 ? 'evening' : 'night'
}

/** Rows = residents, columns = hours. Each cell is that resident's most pressing thread state at that hour. */
export function Board({
  t,
  cursor,
  onCursor,
  selected,
  onSelect,
}: {
  t: Timeline
  cursor: number
  onCursor: (i: number) => void
  selected: string | null
  onSelect: (rid: string) => void
}) {
  const n = t.steps.length
  const cols = `minmax(150px, 210px) repeat(${n}, minmax(14px, 1fr)) 128px`
  // Shift bands across the header.
  const bands: { name: string; from: number; to: number }[] = []
  t.steps.forEach((s, i) => {
    const d = new Date(s)
    if (shiftOf(s) === 'night' && d.getHours() < 7) d.setDate(d.getDate() - 1)
    const name = `${d.toLocaleDateString('en-CA', { weekday: 'short' })} ${shiftOf(s)}`
    const last = bands[bands.length - 1]
    if (last && last.name === name) last.to = i
    else bands.push({ name, from: i, to: i })
  })

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[760px]" aria-label="Ward board: thread state per resident per hour">
        <div className="grid items-end" style={{ gridTemplateColumns: cols }} aria-hidden="true">
          <div className="label pb-1">
            Resident
          </div>
          {bands.map((b) => (
            <div
              key={b.name}
             
              className={`border-l-2 border-ink px-1 pb-1 text-[12px] font-bold whitespace-nowrap ${b.name.includes('night') ? 'text-ink-3' : ''}`}
              style={{ gridColumn: `${b.from + 2} / ${b.to + 3}` }}
            >
              {b.to - b.from >= 2 ? b.name : ''}
            </div>
          ))}
          <div className="label pb-1 pl-3">
            At {t.steps[cursor]?.slice(11, 16)}
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: cols }} aria-hidden="true">
          <div />
          {t.steps.map((s, i) => (
            <button
              key={s}
              type="button"
              tabIndex={-1}
              onClick={() => onCursor(i)}
              className={`h-5 text-center text-[11px] tabular-nums ${i === cursor ? 'font-bold text-ink' : 'text-ink-3'}`}
            >
              {i % 4 === 0 || i === n - 1 ? hourLabel(s) : '·'}
            </button>
          ))}
          <div />
        </div>

        <div className="relative">
          {t.rows.map((r) => {
            const at = r.cells[cursor] ?? null
            const active = selected === r.resident.resident_id
            return (
              <div
                key={r.resident.resident_id}
                className={`grid items-center rounded-md ${active ? 'bg-sticky' : 'hover:bg-fill'}`}
                style={{ gridTemplateColumns: cols }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(r.resident.resident_id)}
                  aria-pressed={active}
                  aria-label={`${r.resident.name}, room ${r.resident.room}: ${at ? STATE_META[at].label : 'no concern'} at ${t.steps[cursor]?.slice(11, 16)}`}
                  className="truncate py-2 pr-2 text-left"
                >
                  <span className="font-bold">{r.resident.preferred_name ?? r.resident.name.split(' ')[0]}</span>{' '}
                  <span className="text-[13px] text-ink-3">
                    {r.resident.name.split(' ').slice(1).join(' ')} · {r.resident.room}
                  </span>
                </button>
                {r.cells.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    title={`${t.steps[i]?.slice(11, 16)} · ${c ? STATE_META[c].label : 'no concern'}`}
                    onClick={() => {
                      onCursor(i)
                      onSelect(r.resident.resident_id)
                    }}
                    className="h-7 border-y-[1.5px] border-r border-ink/25 first:border-l-[1.5px]"
                    style={{
                      background: c ? CELL[c].bg : i % 2 ? 'var(--color-paper)' : '#f4f3ee',
                      opacity: i > cursor ? 0.18 : 1,
                      outline: i === cursor ? '2.5px solid var(--color-ink)' : undefined,
                      outlineOffset: -1,
                      position: 'relative',
                      zIndex: i === cursor ? 1 : 0,
                    }}
                  />
                ))}
                <div className="flex items-center gap-1.5 pl-3 text-[13px]">
                  {at ? (
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: STATE_META[at].color }}>
                      <StateGlyph state={at} />
                      {STATE_META[at].short}
                    </span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
