'use client'

import { possessive, type AttemptView, type ChartPoint } from '@thread/engine'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { DIM_COLOR } from './ResidentCard'

type Row = { label: string; phase: ChartPoint['phase']; notes: ChartPoint['notes'] } & Record<string, number | string | undefined | object>

function TipBox({ active, payload, label, their }: Partial<TooltipContentProps<number, string>> & { their: string }) {
  if (!active || !payload?.length) return null
  const row = payload[0]!.payload as Row
  return (
    <div className="max-w-[280px] rounded-lg border border-line bg-surface p-3 text-[13px] shadow-lg">
      <p className="font-semibold">
        {label} <span className="font-normal text-ink-3">· {row.phase === 'usual' ? `last week, ${their} usual` : 'this week'}</span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey)} className="flex gap-2">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span>
              <b>{p.name}</b> {p.value}
              {row.notes[p.dataKey as keyof Row['notes']] && <span className="block text-ink-3">{row.notes[p.dataKey as keyof Row['notes']]}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The flat view of the same data as the 3D lanes: illustrative index, 100 = the resident's usual. */
export function BaselineChart({ view, bare = false }: { view: AttemptView; bare?: boolean }) {
  const dims = view.scenario.dimensions
  const data: Row[] = view.chart.map((p) => ({ label: p.label, phase: p.phase, notes: p.notes, ...p.values }))
  const usual = view.chart.filter((p) => p.phase === 'usual')
  const observed = view.chart.filter((p) => p.phase === 'observed')
  const their = possessive(view.scenario.resident.pronoun)

  const chart = (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the chart's text alternative; values are also in the timeline
    <div className={`${bare ? 'h-[270px] sm:h-[300px]' : 'h-[240px]'} w-full pt-2`} role="img" aria-label={chartSummary(view)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <ReferenceArea y1={85} y2={115} fill="var(--color-accent)" fillOpacity={0.08} ifOverflow="extendDomain" />
          {usual.length > 0 && <ReferenceArea x1={usual[0]!.label} x2={usual[usual.length - 1]!.label} fill="var(--color-ink)" fillOpacity={0.03} />}
          {observed[0] && <ReferenceLine x={observed[0].label} stroke="var(--color-line-strong)" strokeDasharray="4 4" />}
          <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: 'var(--color-ink-3)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line-strong)' }} interval="preserveStartEnd" minTickGap={6} />
          <YAxis domain={[0, 120]} ticks={[0, 50, 100]} tick={{ fontSize: 11.5, fill: 'var(--color-ink-3)' }} tickLine={false} axisLine={false} />
          <Tooltip content={<TipBox their={their} />} />
          <Legend verticalAlign="top" height={26} iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12.5 }} />
          {dims.map((d) => (
            <Line
              key={d.key}
              dataKey={d.key}
              name={d.label}
              type="monotone"
              stroke={DIM_COLOR[d.key]}
              strokeWidth={2.4}
              connectNulls
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) => {
                const { cx, cy, payload, index } = props
                if (cx == null || cy == null || payload?.[d.key] == null) return <g key={`${d.key}-${index}`} />
                const isUsual = payload.phase === 'usual'
                return (
                  <circle
                    key={`${d.key}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={isUsual ? 3 : 5}
                    fill={isUsual ? 'var(--color-surface)' : DIM_COLOR[d.key]}
                    stroke={DIM_COLOR[d.key]}
                    strokeWidth={isUsual ? 1.5 : 2}
                  />
                )
              }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )

  if (bare) return chart
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="chart-title">
      <h2 id="chart-title" className="text-[18px]">
        {view.scenario.resident.preferredName}’s pattern
      </h2>
      {chart}
    </section>
  )
}

function chartSummary(view: AttemptView) {
  const their = possessive(view.scenario.resident.pronoun)
  const obs = view.chart.filter((p) => p.phase === 'observed')
  if (!obs.length) return `Last week, ${view.scenario.resident.preferredName} was around ${their} usual on every measure.`
  return `Last week around ${their} usual. Since: ${obs
    .map((p) => `${p.label}: ${Object.entries(p.values).map(([k, v]) => `${k} ${v}`).join(', ')}`)
    .join('; ')}.`
}
