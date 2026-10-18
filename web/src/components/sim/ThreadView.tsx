'use client'

import { possessive, type AttemptView } from '@thread/engine'
import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { BaselineChart } from './BaselineChart'
import { DIM_COLOR, DimIcon } from './ResidentCard'

const Lanes3D = dynamic(() => import('../three/Lanes3D'), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-sunken/60" /> })

/** The resident's pattern: 3D lanes by default, a flat chart on request (or when WebGL isn't available). */
export function ThreadView({ view }: { view: AttemptView }) {
  const [mode, setMode] = useState<'3d' | 'chart'>('3d')
  const [canGL, setCanGL] = useState(true)
  const fallback = useCallback(() => {
    setCanGL(false)
    setMode('chart')
  }, [])
  const pick = setMode

  const their = possessive(view.scenario.resident.pronoun)
  const latest = [...view.chart].reverse().find((p) => p.phase === 'observed')
  const dims = view.scenario.dimensions

  return (
    <section className="card overflow-hidden" aria-labelledby="thread-title">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 sm:px-5">
        <h2 id="thread-title" className="text-[18px]">
          {view.scenario.resident.preferredName}’s pattern
        </h2>
        <fieldset className="flex items-center gap-1 rounded-lg bg-sunken p-0.5 text-[12.5px] font-medium">
          <legend className="sr-only">View</legend>
          {canGL && (
            <button type="button" aria-pressed={mode === '3d'} onClick={() => pick('3d')} className={`rounded-md px-2.5 py-1 ${mode === '3d' ? 'bg-surface shadow-sm' : 'text-ink-3'}`}>
              3D
            </button>
          )}
          <button type="button" aria-pressed={mode === 'chart'} onClick={() => pick('chart')} className={`rounded-md px-2.5 py-1 ${mode === 'chart' ? 'bg-surface shadow-sm' : 'text-ink-3'}`}>
            Chart
          </button>
        </fieldset>
      </div>

      {mode === '3d' ? (
        <div className="relative h-[270px] sm:h-[300px]">
          <Lanes3D points={view.chart} dimensions={dims} onFallback={fallback} />
          <span className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-ink-3">drag to turn · band = {their} usual</span>
        </div>
      ) : (
        <div className="px-1 sm:px-2">
          <BaselineChart view={view} bare />
        </div>
      )}

      <ul className="grid grid-cols-3 gap-px border-t border-line bg-line text-[12.5px]">
        {dims.map((d) => {
          const v = latest?.values[d.key]
          const tone = v == null ? null : v >= 85 ? 'good' : v >= 50 ? 'mid' : 'poor'
          return (
            <li key={d.key} className="flex items-center gap-2 bg-surface px-3 py-2">
              <DimIcon dim={d.key} size={16} />
              <span className="min-w-0">
                <b className="block truncate" style={{ color: DIM_COLOR[d.key] }}>
                  {d.label}
                </b>
                <span className="font-medium" style={{ color: tone ? `var(--color-${tone})` : 'var(--color-ink-3)' }}>
                  {tone === 'good' ? 'usual' : tone === 'mid' ? 'below usual' : tone === 'poor' ? 'well below' : 'no change yet'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
