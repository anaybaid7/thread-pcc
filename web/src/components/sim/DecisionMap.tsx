'use client'

import { scenarioMap, type MapEdge, type MapNode, type Scenario } from '@thread/engine'
import { useMemo, useState } from 'react'
import { toneOf } from '../motion'
import { KIND } from './EventTimeline'

type Box = {
  key: string
  col: number
  kind: 'node' | 'choice'
  node?: MapNode
  edge?: MapEdge
  on: boolean
}

const BW = 158
const BH = 58
const CW = 136
const CH = 40
const GX = 34
const GY = 12

/**
 * The scenario as a map: situations and decisions, every choice with its points, and where each leads. The path
 * this attempt took is drawn solid; click any box to see what it contains or would have led to.
 */
export function DecisionMap({ scenario, course, chosen }: { scenario: Scenario; course: string; chosen: Record<string, string> }) {
  const [sel, setSel] = useState<string | null>(null)
  const { boxes, links, width, height } = useMemo(() => {
    const m = scenarioMap(scenario, course)
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    // The attempt's path through this course: follow the chosen choice at each decision.
    const onPath = new Set<string>()
    let cur: string | undefined = scenario.start
    while (cur && !onPath.has(cur)) {
      onPath.add(cur)
      const n: MapNode = byId.get(cur)!
      const out = m.edges.filter((e) => e.from === cur)
      const next: MapEdge | undefined = n.decision ? out.find((e) => e.choice?.id === chosen[n.decision!.id]) : out[0]
      if (next?.choice) onPath.add(`${cur}:${next.choice.id}`)
      cur = next?.to
    }
    // Columns: situations at even layers, choices between them; drop empty layers.
    const layer = new Map<string, number>()
    for (const n of m.nodes) layer.set(n.id, n.depth * 2)
    const raw: Box[] = m.nodes.map((n) => ({ key: n.id, col: n.depth * 2, kind: 'node', node: n, on: onPath.has(n.id) }))
    for (const e of m.edges.filter((x) => x.choice)) raw.push({ key: `${e.from}:${e.choice!.id}`, col: layer.get(e.from)! + 1, kind: 'choice', edge: e, on: onPath.has(`${e.from}:${e.choice!.id}`) })
    const used = [...new Set(raw.map((b) => b.col))].sort((a, b) => a - b)
    const colOf = new Map(used.map((c, i) => [c, i]))
    const cols = used.map((c) => raw.filter((b) => b.col === c))
    const colH = cols.map((bs) => bs.reduce((h, b) => h + (b.kind === 'node' ? BH : CH) + GY, -GY))
    const height = Math.max(...colH) + 8
    const xs: number[] = []
    let acc = 0
    cols.forEach((bs) => {
      xs.push(acc)
      acc += (bs.some((b) => b.kind === 'node') ? BW : CW) + GX
    })
    const pos = new Map<string, { x: number; y: number; w: number; h: number }>()
    cols.forEach((bs, ci) => {
      let yy = (height - colH[ci]!) / 2
      for (const b of bs) {
        const w = b.kind === 'node' ? BW : CW
        const h = b.kind === 'node' ? BH : CH
        pos.set(b.key, { x: xs[ci]!, y: yy, w, h })
        yy += h + GY
      }
    })
    const links: { a: string; b: string; on: boolean }[] = []
    for (const e of m.edges) {
      if (e.choice) {
        const c = `${e.from}:${e.choice.id}`
        links.push({ a: e.from, b: c, on: onPath.has(c) }, { a: c, b: e.to, on: onPath.has(c) })
      } else links.push({ a: e.from, b: e.to, on: onPath.has(e.from) && onPath.has(e.to) })
    }
    return {
      boxes: raw.map((b) => ({ ...b, col: colOf.get(b.col)!, ...pos.get(b.key)! })),
      links: links.map((l) => ({ ...l, pa: pos.get(l.a)!, pb: pos.get(l.b)! })),
      width: acc - GX + 4,
      height,
    }
  }, [scenario, course, chosen])

  const picked = boxes.find((b) => b.key === sel)
  const choiceLabel = (id: string) =>
    Object.values(scenario.nodes)
      .flatMap((n) => n.decision?.choices ?? [])
      .find((c) => c.id === id)?.label ?? id

  return (
    <div className="grid gap-4">
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- WCAG: a region that scrolls must be reachable by keyboard */}
      <section className="overflow-x-auto rounded-lg border border-line bg-sunken/30 p-3" tabIndex={0} aria-label="Decision map, scrolls sideways">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="Map of this scenario: decisions, choices and where each leads. Your path is drawn solid.">
          {links.map((l, i) => {
            const x1 = l.pa.x + l.pa.w
            const y1 = l.pa.y + l.pa.h / 2
            const x2 = l.pb.x
            const y2 = l.pb.y + l.pb.h / 2
            const mx = (x1 + x2) / 2
            return (
              <path
                key={i}
                d={`M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={l.on ? 'var(--color-ink)' : 'var(--color-line-strong)'}
                strokeWidth={l.on ? 2 : 1.2}
              />
            )
          })}
          {boxes.map((b) => {
            const active = sel === b.key
            if (b.kind === 'choice') {
              const c = b.edge!.choice!
              const tone = toneOf(c.earned, c.max)
              return (
                <g
                  key={b.key}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG node; <button> is not valid inside SVG
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${b.on ? 'Your choice' : 'Alternative'}: ${b.edge!.choice!.label}, ${b.edge!.choice!.earned} of ${b.edge!.choice!.max}`}
                  className="cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-[var(--color-accent)]"
                  onClick={() => setSel(active ? null : b.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSel(active ? null : b.key)
                    }
                  }}
                >
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx={6}
                    fill={b.on ? 'var(--color-ink)' : 'var(--color-surface)'}
                    stroke={active ? 'var(--color-accent)' : b.on ? 'var(--color-ink)' : 'var(--color-line-strong)'}
                    strokeWidth={active ? 2.5 : 1}
                  />
                  <rect x={b.x} y={b.y + b.h - 4} width={(b.w * c.earned) / c.max} height={4} fill={`var(--color-${tone})`} />
                  <foreignObject x={b.x + 8} y={b.y + 4} width={b.w - 44} height={b.h - 8}>
                    <p className={`line-clamp-2 text-[11px] leading-tight ${b.on ? 'text-white' : 'text-ink-2'}`}>{c.label}</p>
                  </foreignObject>
                  <text x={b.x + b.w - 8} y={b.y + 18} textAnchor="end" fontSize="11.5" fontWeight="700" fill={b.on ? '#fff' : `var(--color-${tone})`} fontFamily="ui-monospace, Menlo, monospace">
                    {c.earned}
                  </text>
                </g>
              )
            }
            const n = b.node!
            const lead = n.facts[0]
            return (
              <g
                  key={b.key}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG node; <button> is not valid inside SVG
                  role="button"
                  tabIndex={0}
                  aria-pressed={active}
                  aria-label={`${b.node!.label}${b.node!.decision ? `, decision at ${b.node!.decision.clock}` : ''}`}
                  className="cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-[var(--color-accent)]"
                  onClick={() => setSel(active ? null : b.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSel(active ? null : b.key)
                    }
                  }}
                >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={8}
                  fill="var(--color-surface)"
                  stroke={active ? 'var(--color-accent)' : b.on ? 'var(--color-ink)' : 'var(--color-line-strong)'}
                  strokeWidth={active ? 2.5 : b.on ? 2 : 1}
                  strokeDasharray={b.on ? undefined : '4 3'}
                />
                {n.decision && <rect x={b.x + 8} y={b.y + 9} width={8} height={8} transform={`rotate(45 ${b.x + 12} ${b.y + 13})`} fill="var(--color-ink)" />}
                <text x={b.x + (n.decision ? 22 : 10)} y={b.y + 17} fontSize="10.5" fontWeight="700" fill="var(--color-ink-2)">
                  {n.decision ? n.decision.clock : n.handover ? 'Handover' : n.label.split('·')[0]!.trim()}
                </text>
                <foreignObject x={b.x + 10} y={b.y + 22} width={b.w - 18} height={b.h - 26}>
                  <p className="line-clamp-2 text-[11px] leading-tight text-ink-2">{n.decision ? n.decision.title.replace(/^.*?\.\s*/, '') : lead?.text}</p>
                </foreignObject>
              </g>
            )
          })}
        </svg>
      </section>
      <aside className="min-h-[88px] rounded-lg border border-line p-4 text-[13.5px]" aria-live="polite">
        {!picked ? (
          <p className="text-ink-3">Select any box to see what happened there, or what a different choice would have led to. Your path is drawn solid.</p>
        ) : picked.kind === 'choice' ? (
          <div className="enter space-y-2">
            <p className="eyebrow">{picked.on ? 'Your choice' : 'Alternative'}</p>
            <p className="font-semibold">{picked.edge!.choice!.label}</p>
            <p className="font-mono text-[12.5px]" style={{ color: `var(--color-${toneOf(picked.edge!.choice!.earned, picked.edge!.choice!.max)})` }}>
              {picked.edge!.choice!.earned} / {picked.edge!.choice!.max} for action
            </p>
            <p className="text-ink-2">{picked.edge!.choice!.feedback}</p>
          </div>
        ) : (
          <div className="enter space-y-2">
            <p className="eyebrow">{picked.node!.label}</p>
            <ul className="space-y-1.5">
              {picked.node!.facts.map((f) => (
                <li key={f.id} className="grid grid-cols-[64px_1fr] gap-2">
                  <span className="font-mono text-[11.5px] text-ink-3">{f.when}</span>
                  <span>
                    <span style={{ color: KIND[f.kind as keyof typeof KIND]?.color }}>{f.text}</span>
                    {f.onlyIf && <span className="block text-[11.5px] text-ink-3">only if you chose: {f.onlyIf.map(choiceLabel).join(' / ')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}
