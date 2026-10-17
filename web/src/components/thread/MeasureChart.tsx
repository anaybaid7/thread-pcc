import { when } from '@/lib/format'
import type { CarePlanRule, Gap, SourceRecord } from '@/lib/types'

/**
 * Every measurement for this concern against the resident's own target, Monday 07:00 to now. Empty stretches are
 * the point: they show where nobody recorded a measurement.
 */
export function MeasureChart({
  sources,
  rule,
  gaps,
  asOf,
  labels,
}: {
  sources: SourceRecord[]
  rule: CarePlanRule | null
  gaps: Gap[]
  asOf: string
  labels: Record<string, string>
}) {
  const mobility = rule?.metric === 'assist_level'
  const points = sources.filter((s) =>
    s.value != null && (mobility ? s.unit === 'staff assist' : s.unit === 'mL') && s.source_type !== 'progress_note',
  )
  const W = 400
  const H = 160
  const pad = { l: 44, r: 12, t: 14, b: 30 }
  const t0 = new Date('2026-10-19T07:00:00').getTime()
  const t1 = Math.max(new Date(asOf).getTime(), t0 + 3600_000)
  const x = (iso: string) => pad.l + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r)
  const max = mobility ? 2 : Math.max(400, ...points.map((p) => p.value ?? 0), (rule?.threshold ?? 0) * 1.4)
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b)
  const ticks = mobility ? [0, 1, 2] : [0, 100, 200, 300, 400].filter((v) => v <= max)
  const days = ['2026-10-19T07:00:00', '2026-10-19T15:00:00', '2026-10-19T23:00:00', '2026-10-20T07:00:00'].filter(
    (d) => new Date(d).getTime() <= t1,
  )
  const target = rule?.baseline_documented ? rule.threshold : null

  return (
    <figure>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an inline chart, not a raster image */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${mobility ? 'Mobility checks' : 'Fluid rounds'}: ${points.map((p) => `${p.value} at ${when(p.event_time)}`).join(', ') || 'none recorded'}`}>
        <defs>
          <pattern id="gap-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="7" height="7" fill="rgb(184 50 42 / 0.06)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(184 50 42 / 0.28)" strokeWidth="2" />
          </pattern>
        </defs>
        {gaps.map((g) => (
          <rect key={g.start} x={x(g.start)} y={pad.t} width={Math.max(2, x(g.end) - x(g.start))} height={H - pad.t - pad.b} fill="url(#gap-hatch)" />
        ))}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line-soft)" strokeDasharray="2 4" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-3)">
              {mobility ? ['indep.', '1 asst', '2 asst'][v] : v}
            </text>
          </g>
        ))}
        {days.map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={pad.t} y2={H - pad.b} stroke="var(--color-line-soft)" />
            <text x={x(d) + 3} y={H - 10} fontSize="11" fill="var(--color-ink-3)">
              {when(d)}
            </text>
          </g>
        ))}
        {target != null && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="var(--color-verified)" strokeWidth="2" strokeDasharray="7 5" />
            <text x={W - pad.r} y={y(target) - 5} textAnchor="end" fontSize="11.5" fontWeight="700" fill="var(--color-verified)">
              {mobility ? 'usual level' : `target ${target} mL`}
            </text>
          </g>
        )}
        {points.map((p) => {
          const ok = target == null ? null : mobility ? (p.value ?? 0) <= target : (p.value ?? 0) >= target
          const lab = labels[p.source_id]
          return (
            <g key={p.source_id}>
              <circle cx={x(p.event_time)} cy={y(p.value ?? 0)} r="6" fill={ok == null ? 'var(--color-ink-3)' : ok ? 'var(--color-verified)' : 'var(--color-persistent)'} stroke="var(--color-ink)" strokeWidth="1.6" />
              {lab && (
                <text x={x(p.event_time)} y={y(p.value ?? 0) - 10} textAnchor="middle" fontSize="11.5" fontWeight="700">
                  {lab}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="mt-1 text-[13px] text-ink-3">
        {points.length} {mobility ? 'mobility check' : 'fluid round'}
        {points.length === 1 ? '' : 's'} recorded since Mon 07:00. Hatched: no measurement for longer than the follow-up
        window.
      </figcaption>
    </figure>
  )
}
