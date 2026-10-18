'use client'

/**
 * Decision quality against outcome. The same decision sits at the same height whichever way the day went:
 * the point of judging decisions on what was known at the time (Baron & Hershey's outcome bias, made visible).
 */
export function OutcomeMatrix({
  quality,
  course,
  labels,
}: {
  /** 0..1: the first decision's score as a share of its maximum. */
  quality: number
  course: 'persist' | 'resolve'
  labels: { resolve: string; persist: string }
}) {
  const W = 420
  const H = 270
  const L = 58
  const T = 26
  const R = 14
  const B = 40
  const pw = W - L - R
  const ph = H - T - B
  const colX = (c: 'resolve' | 'persist') => L + (c === 'resolve' ? 0.25 : 0.75) * pw
  const y = T + (1 - quality) * ph
  const split = T + (1 - 0.8) * ph
  const other = course === 'persist' ? 'resolve' : 'persist'
  const Q = [
    { x: L + 8, y: T + 14, t: 'Sound decision', s: 'good outcome' },
    { x: L + pw / 2 + 8, y: T + 14, t: 'Sound decision', s: 'bad outcome' },
    { x: L + 8, y: T + ph - 22, t: 'Weak decision', s: 'lucky outcome' },
    { x: L + pw / 2 + 8, y: T + ph - 22, t: 'Weak decision', s: 'bad outcome' },
  ]
  return (
    <svg
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a static SVG chart with a text alternative
      role="img"
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-[460px]"
      aria-label={`Decision quality ${Math.round(quality * 100)} percent. This run: ${labels[course]}. The same decision in the other version of the day sits at the same height.`}
    >
      <rect x={L} y={T} width={pw} height={ph} fill="var(--color-surface)" stroke="var(--color-line-strong)" />
      <rect x={L} y={T} width={pw} height={split - T} fill="var(--color-good)" opacity={0.06} />
      <line x1={L} x2={L + pw} y1={split} y2={split} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
      <line x1={L + pw / 2} x2={L + pw / 2} y1={T} y2={T + ph} stroke="var(--color-line-strong)" />
      {Q.map((q) => (
        <text key={q.t + q.s} x={q.x} y={q.y} fontSize="10.5" fill="var(--color-ink-3)">
          <tspan fontWeight="600" fill="var(--color-ink-2)">
            {q.t}
          </tspan>
          <tspan x={q.x} dy="13">
            {q.s}
          </tspan>
        </text>
      ))}
      {[0, 0.5, 1].map((v) => (
        <text key={v} x={L - 8} y={T + (1 - v) * ph + 4} fontSize="10.5" textAnchor="end" fill="var(--color-ink-3)" fontFamily="ui-monospace, Menlo, monospace">
          {Math.round(v * 100)}%
        </text>
      ))}
      <text x={14} y={T + ph / 2} fontSize="11" fill="var(--color-ink-2)" transform={`rotate(-90 14 ${T + ph / 2})`} textAnchor="middle" fontWeight="600">
        Monday decision
      </text>
      <text x={colX('resolve')} y={H - 14} fontSize="11.5" textAnchor="middle" fill="var(--color-good)" fontWeight="600">
        {labels.resolve}
      </text>
      <text x={colX('persist')} y={H - 14} fontSize="11.5" textAnchor="middle" fill="var(--color-poor)" fontWeight="600">
        {labels.persist}
      </text>

      <line x1={colX(course)} x2={colX(other)} y1={y} y2={y} stroke="var(--color-ink)" strokeDasharray="2 3" opacity={0.5} />
      <circle cx={colX(other)} cy={y} r={7} fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth={1.5} strokeDasharray="2 2" />
      <circle cx={colX(course)} cy={y} r={8} fill="var(--color-ink)" />
      <text x={colX(course) + 13} y={y + 4} fontSize="11" fontWeight="700" fill="var(--color-ink)">
        this run · {Math.round(quality * 100)}%
      </text>
      <text x={colX(other) + 12} y={y + 4} fontSize="11" fill="var(--color-ink-3)">
        same decision
      </text>
    </svg>
  )
}
