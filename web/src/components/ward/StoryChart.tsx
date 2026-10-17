'use client'

import type { State, Story, StoryMarker } from '@/lib/types'
import { CELL } from './Board'

const W = 720
const PAD_L = 52
const PAD_R = 30
const TOP = 26
const PLOT_H = 130
const NOTES_Y = TOP + PLOT_H + 26
const RIBBON_Y = NOTES_Y + 30
const H = RIBBON_Y + 34

const ROLE_COLOR: Record<string, string> = {
  signal: 'var(--color-persistent)',
  recurrence: 'var(--color-persistent)',
  response: 'var(--color-watching)',
  plan: 'var(--color-ink-3)',
  outcome: 'var(--color-verified)',
  contradiction: 'var(--color-ambiguous)',
  context: 'var(--color-ink-3)',
}

function Mark({ m, x, active }: { m: StoryMarker; x: number; active: boolean }) {
  const c = ROLE_COLOR[m.role] ?? 'var(--color-ink-3)'
  const y = NOTES_Y
  const s = active ? 1.25 : 1
  const common = { stroke: 'var(--color-ink)', strokeWidth: 1.8 }
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {m.role === 'response' ? (
        <rect x={-8} y={-8} width={16} height={16} rx={3} fill={c} {...common} />
      ) : m.role === 'plan' ? (
        <circle r={8} fill="var(--color-paper)" {...common} strokeDasharray="3 2.5" />
      ) : m.role === 'recurrence' || m.role === 'signal' ? (
        <>
          <circle r={9} fill="var(--color-paper)" {...common} />
          <circle r={4.5} fill={c} />
        </>
      ) : m.role === 'contradiction' ? (
        <path d="M0 -9 9 0 0 9 -9 0Z" fill={c} {...common} />
      ) : m.role === 'outcome' ? (
        <>
          <circle r={9} fill={c} {...common} />
          <path d="M-4 0l3 3 5-6" stroke="white" strokeWidth={2.2} fill="none" />
        </>
      ) : (
        <circle r={5} fill="var(--color-fill-2)" stroke="var(--color-ink-3)" strokeWidth={1.5} />
      )}
    </g>
  )
}

/** One resident's last day: measurements against the target, what staff wrote, where nothing was recorded. */
export function StoryChart({
  story,
  steps,
  cells,
  cursor,
  selected,
  onSelect,
}: {
  story: Story
  steps: string[]
  cells: (State | null)[]
  cursor: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const t0 = new Date(steps[0]!).getTime()
  const t1 = new Date(steps[steps.length - 1]!).getTime()
  const x = (iso: string) => PAD_L + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - PAD_L - PAD_R)
  const cursorIso = steps[cursor]!
  const seen = (recorded: string) => recorded <= cursorIso
  const mobility = story.domain === 'mobility'
  const target = story.rule?.baseline_documented ? story.rule.threshold : null
  const max = mobility ? 2 : Math.max(400, ...story.measures.map((m) => m.value + 40))
  const y = (v: number) => TOP + PLOT_H - (v / max) * PLOT_H
  const ticks = mobility ? [0, 1, 2] : [0, 100, 200, 300, 400].filter((v) => v <= max)
  const shiftEdges = steps.filter((s) => ['07', '15', '23'].includes(s.slice(11, 13)) && s.slice(14, 16) === '00')
  const step = (W - PAD_L - PAD_R) / (steps.length - 1)

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline chart; the note list below is the keyboard path
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" role="img" aria-label={`${story.resident.display_name}: ${story.measures.length} measurements and ${story.markers.length} notes since Monday 07:00`}>
      <defs>
        <pattern id="story-gap" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="7" height="7" fill="rgb(184 50 42 / 0.06)" />
          <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(184 50 42 / 0.3)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Night shading and shift edges */}
      {steps.map((s, i) => {
        const h = Number(s.slice(11, 13))
        return h >= 23 || h < 7 ? <rect key={s} x={PAD_L + i * step - step / 2} y={TOP - 8} width={step} height={RIBBON_Y + 18 - TOP} fill="rgb(31 35 40 / 0.045)" /> : null
      })}
      {shiftEdges.map((s) => (
        <g key={s}>
          <line x1={x(s)} x2={x(s)} y1={TOP - 12} y2={RIBBON_Y + 18} stroke="var(--color-line-soft)" strokeDasharray="3 3" />
          <text x={x(s) + 3} y={TOP - 14} fontSize="11" fill="var(--color-ink-3)">
            {new Date(s).toLocaleDateString('en-CA', { weekday: 'short' })} {s.slice(11, 16)}
          </text>
        </g>
      ))}

      {/* Evidence gaps */}
      {story.gaps.map((g) => (
        <g key={g.start}>
          <rect x={x(g.start)} y={TOP} width={Math.max(2, x(g.end) - x(g.start))} height={PLOT_H} fill="url(#story-gap)" />
          <text x={(x(g.start) + x(g.end)) / 2} y={TOP + 16} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--color-persistent)">
            nothing measured
          </text>
        </g>
      ))}

      {/* Measurement axis and target */}
      {ticks.map((v) => (
        <text key={v} x={PAD_L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-3)">
          {mobility ? ['indep.', '1 assist', '2 assist'][v] : `${v}`}
        </text>
      ))}
      <text x={6} y={TOP + 4} fontSize="11" fill="var(--color-ink-3)">
        {mobility ? '' : 'mL'}
      </text>
      <line x1={PAD_L} x2={W - PAD_R} y1={TOP + PLOT_H} y2={TOP + PLOT_H} stroke="var(--color-ink)" strokeWidth="1.5" />
      {target != null && (
        <g>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(target)} y2={y(target)} stroke="var(--color-verified)" strokeWidth="2.2" strokeDasharray="8 5" />
          <text x={W - PAD_R} y={y(target) - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--color-verified)">
            {mobility ? 'usual level' : `target ${target} mL`}
          </text>
        </g>
      )}
      {story.measures.map((m) => {
        const ok = m.meets
        const fill = ok == null ? 'var(--color-ink-3)' : ok ? 'var(--color-verified)' : 'var(--color-persistent)'
        const on = seen(m.recorded_at)
        return (
          <g key={m.id} opacity={on ? 1 : 0.15}>
            <line x1={x(m.time)} x2={x(m.time)} y1={TOP + PLOT_H} y2={y(m.value)} stroke={fill} strokeWidth="3" />
            <circle cx={x(m.time)} cy={y(m.value)} r={8} fill={fill} stroke="var(--color-ink)" strokeWidth="1.8" />
            <text x={x(m.time)} y={y(m.value) - 13} textAnchor="middle" fontSize="12.5" fontWeight="700">
              {mobility ? '' : m.value}
            </text>
          </g>
        )
      })}

      {/* Notes lane */}
      <text x={PAD_L - 8} y={NOTES_Y + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-3)">
        notes
      </text>
      <line x1={PAD_L} x2={W - PAD_R} y1={NOTES_Y} y2={NOTES_Y} stroke="var(--color-line-soft)" />
      {story.markers.map((m, i) => {
        // Nudge markers written at the same minute so each stays clickable.
        const same = story.markers.slice(0, i).filter((o) => Math.abs(x(o.time) - x(m.time)) < 14).length
        const mx = x(m.time) + same * 16
        return (
          <g
            key={m.id}
            opacity={seen(m.recorded_at) ? 1 : 0.15}
            onClick={() => onSelect(m.id)}
            className="cursor-pointer"
          >
            <rect x={mx - 12} y={NOTES_Y - 12} width={24} height={24} fill="transparent" />
            <Mark m={m} x={mx} active={selected === m.id} />
          </g>
        )
      })}

      {/* State ribbon */}
      <text x={PAD_L - 8} y={RIBBON_Y + 11} textAnchor="end" fontSize="11" fill="var(--color-ink-3)">
        state
      </text>
      {cells.map((c, i) => (
        <rect
          key={i}
          x={PAD_L + i * step - step / 2 + (i === 0 ? step / 2 : 0)}
          y={RIBBON_Y}
          width={i === 0 || i === cells.length - 1 ? step / 2 : step}
          height={14}
          fill={c ? CELL[c].bg : 'var(--color-fill)'}
          opacity={i > cursor ? 0.18 : 1}
        />
      ))}
      <rect x={PAD_L} y={RIBBON_Y} width={W - PAD_L - PAD_R} height={14} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />

      {/* Cursor */}
      <line x1={x(cursorIso)} x2={x(cursorIso)} y1={TOP - 6} y2={RIBBON_Y + 20} stroke="var(--color-ink)" strokeWidth="2" />
      <text x={x(cursorIso)} y={RIBBON_Y + 31} textAnchor="middle" fontSize="11.5" fontWeight="700">
        {cursorIso.slice(11, 16)}
      </text>
    </svg>
  )
}
