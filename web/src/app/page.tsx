'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Board, LEGEND, Swatch } from '@/components/ward/Board'
import { StoryPanel } from '@/components/ward/StoryPanel'
import { ErrorBox, Skeleton } from '@/components/ui'
import { get } from '@/lib/api'
import { STATE_META } from '@/lib/format'
import type { State, Timeline } from '@/lib/types'

function dayTime(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-CA', { weekday: 'long' })} ${iso.slice(11, 16)}`
}

export default function Ward() {
  const q = useQuery({ queryKey: ['timeline'], queryFn: () => get<Timeline>('/timeline') })
  const t = q.data
  const last = (t?.steps.length ?? 1) - 1
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [selected, setSelected] = useState<string | null>('R214')
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const at = cursor ?? last

  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setCursor((c) => {
        const next = (c ?? 0) + 1
        if (next >= last) {
          setPlaying(false)
          return last
        }
        return next
      })
    }, 650)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [playing, last])

  const play = () => {
    if (playing) return setPlaying(false)
    if (at >= last) setCursor(0)
    setPlaying(true)
  }

  const counts = (state: State) => t?.rows.filter((r) => r.cells[at] === state).length ?? 0
  const open = (['persistent_signal', 'new_signal', 'unverified', 'ambiguous'] as State[]).reduce((n, s) => n + counts(s), 0)
  const row = t?.rows.find((r) => r.resident.resident_id === selected)

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label">Valleyview Commons · 14 residents · synthetic</p>
          <h1 className="text-[30px] sm:text-[36px]">
            The last 26 hours, <span className="scribble">one row per resident</span>
          </h1>
          <p className="mt-1 text-ink-2">Press play to watch concerns appear across the shifts. Click a resident to see their day.</p>
        </div>
        <Link href="/handover" className="btn">
          Shift handover →
        </Link>
      </div>

      {q.isError ? (
        <ErrorBox error={q.error} retry={() => q.refetch()} />
      ) : !t ? (
        <div className="panel p-6">
          <Skeleton lines={10} />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="panel p-4 sm:p-5" aria-label="Ward board">
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <button type="button" onClick={play} className="btn btn-primary min-w-[118px] text-[16px]" aria-pressed={playing}>
                {playing ? '❚❚ Pause' : at >= last ? '▶ Replay' : '▶ Play'}
              </button>
              <div className="min-w-[220px] flex-1">
                <label className="block">
                  <span className="sr-only">Time</span>
                  <input
                    type="range"
                    min={0}
                    max={last}
                    value={at}
                    onChange={(e) => {
                      setPlaying(false)
                      setCursor(Number(e.target.value))
                    }}
                    className="w-full accent-[var(--color-ink)]"
                    aria-valuetext={dayTime(t.steps[at]!)}
                  />
                </label>
              </div>
              <div className="text-right">
                <p className="text-[22px] leading-none font-bold tabular-nums">{dayTime(t.steps[at]!)}</p>
                <p className="text-[13px] text-ink-3">{at === last ? 'now' : 'replaying, only what had been entered by then'}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2" aria-live="polite">
              <span className="chip" style={{ color: 'var(--color-ink)' }}>
                {open} need a second look
              </span>
              {LEGEND.filter(Boolean).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[13.5px]">
                  <Swatch state={s} />
                  {STATE_META[s as State].short} <b>{counts(s as State)}</b>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 text-[13.5px]">
                <Swatch state={null} /> no concern
              </span>
            </div>

            <Board
              t={t}
              cursor={at}
              onCursor={(i) => {
                setPlaying(false)
                setCursor(i)
              }}
              selected={selected}
              onSelect={setSelected}
            />
          </section>

          {selected && row && (
            <StoryPanel key={selected} rid={selected} steps={t.steps} cells={row.cells} cursor={at} onClose={() => setSelected(null)} />
          )}

          <p className="text-[13.5px] text-ink-3">
            Prefer a list? <Link href="/queue" className="underline underline-offset-4">Open the review queue</Link>. Colours are thread states, not risk
            scores: red means a signal came back after a response, orange means nobody has answered a signal, yellow means a
            response with no recorded outcome, purple means the evidence is unclear.
          </p>
        </div>
      )}
    </>
  )
}
