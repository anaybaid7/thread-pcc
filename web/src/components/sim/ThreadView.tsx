'use client'

import { possessive, type AttemptView } from '@thread/engine'
import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { BaselineChart } from './BaselineChart'
import { PatternHeatmap } from './PatternHeatmap'

const Lanes3D = dynamic(() => import('../three/Lanes3D'), { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-sunken/60" /> })

type Mode = 'heatmap' | 'lines' | '3d'

/** The resident's pattern against their usual: as a deviation heatmap, as lines, or as 3D lanes. */
export function ThreadView({ view }: { view: AttemptView }) {
  const [mode, setMode] = useState<Mode>('heatmap')
  const [canGL, setCanGL] = useState(true)
  const fallback = useCallback(() => {
    setCanGL(false)
    setMode('heatmap')
  }, [])
  const their = possessive(view.scenario.resident.pronoun)
  const MODES: [Mode, string][] = [
    ['heatmap', 'Heatmap'],
    ['lines', 'Lines'],
    ...(canGL ? ([['3d', '3D']] as [Mode, string][]) : []),
  ]

  return (
    <section className="card overflow-hidden" aria-labelledby="thread-title">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 sm:px-5">
        <div>
          <h2 id="thread-title" className="text-[18px]">
            Pattern against {their} usual
          </h2>
        </div>
        <fieldset className="flex items-center gap-0.5 rounded-lg bg-sunken p-0.5 text-[12.5px] font-medium">
          <legend className="sr-only">View</legend>
          {MODES.map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 ${mode === m ? 'bg-surface shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </fieldset>
      </div>
      {mode === 'heatmap' && <PatternHeatmap view={view} />}
      {mode === 'lines' && (
        <div className="px-1 pb-2 sm:px-2">
          <BaselineChart view={view} bare />
        </div>
      )}
      {mode === '3d' && (
        <div className="relative h-[270px] sm:h-[300px]">
          <Lanes3D points={view.chart} dimensions={view.scenario.dimensions} onFallback={fallback} />
          <span className="pointer-events-none absolute right-3 bottom-2 text-[11px] text-ink-3">drag to rotate · band = {their} usual</span>
        </div>
      )}
    </section>
  )
}
