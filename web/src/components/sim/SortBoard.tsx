'use client'

import type { Tag } from '@thread/engine'
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'

export const BINS: { id: Tag; label: string; hint: string; color: string; soft: string }[] = [
  { id: 'observed', label: 'Observed', hint: 'seen, heard or charted', color: 'var(--color-observation)', soft: 'var(--color-accent-soft)' },
  { id: 'assumption', label: 'Assumption', hint: 'a guess or explanation', color: 'var(--color-mid)', soft: 'var(--color-mid-soft)' },
  { id: 'unknown', label: 'Unknown', hint: 'nobody checked', color: 'var(--color-unknown)', soft: '#f6ece2' },
]

export function BinIcon({ tag, size = 22 }: { tag: Tag; size?: number }) {
  const c = BINS.find((b) => b.id === tag)!.color
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {tag === 'observed' ? (
        <>
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke={c} strokeWidth="1.8" />
          <circle cx="12" cy="12" r="3" fill={c} />
        </>
      ) : tag === 'assumption' ? (
        <>
          <path d="M6 15a5 5 0 0 1 1.5-9.7A5.5 5.5 0 0 1 18 7a4 4 0 0 1-1 8H6z" fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="7.5" cy="19" r="1.4" fill={c} />
          <circle cx="4.5" cy="21.5" r="0.9" fill={c} />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" fill="none" stroke={c} strokeWidth="1.8" strokeDasharray="3 2.4" />
          <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16.8" r="1.1" fill={c} />
        </>
      )}
    </svg>
  )
}

type Drag = { id: string; x: number; y: number; ox: number; oy: number; w: number; moved: boolean; over: Tag | 'tray' | null }

/** Drag each statement into a bin. Tap a statement, then tap a bin, works too (and by keyboard). */
export function SortBoard({
  statements,
  tags,
  onChange,
}: {
  statements: { id: string; text: string }[]
  tags: Record<string, Tag>
  onChange: (id: string, tag: Tag | null) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  const unsorted = statements.filter((s) => !tags[s.id])
  const textOf = (id: string) => statements.find((s) => s.id === id)?.text ?? ''

  const targetAt = (x: number, y: number): Tag | 'tray' | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null
    return (el?.dataset.drop as Tag | 'tray' | undefined) ?? null
  }

  const down = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const r = e.currentTarget.getBoundingClientRect()
    start.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, moved: false, over: null })
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || !start.current) return
    const moved = drag.moved || Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved, over: moved ? targetAt(e.clientX, e.clientY) : null })
  }
  const up = (id: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag
    setDrag(null)
    start.current = null
    if (!d) return
    if (!d.moved) {
      setPicked((p) => (p === id ? null : id))
      return
    }
    const t = targetAt(e.clientX, e.clientY)
    if (t === 'tray') onChange(id, null)
    else if (t) onChange(id, t)
    setPicked(null)
  }
  const dropPicked = (t: Tag | 'tray') => {
    if (!picked) return
    onChange(picked, t === 'tray' ? null : t)
    setPicked(null)
  }

  const card = (id: string, small = false) => {
    const isDragging = drag?.id === id && drag.moved
    return (
      <button
        key={id}
        type="button"
        onPointerDown={down(id)}
        onPointerMove={move}
        onPointerUp={up(id)}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setPicked((p) => (p === id ? null : id))
          }
        }}
        aria-pressed={picked === id}
        className={`pop w-full touch-none rounded-lg border bg-surface text-left shadow-sm transition-[transform,box-shadow,opacity] select-none ${
          small ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2.5 text-[14px]'
        } ${picked === id ? 'z-10 -translate-y-0.5 border-accent shadow-md ring-2 ring-accent/40' : 'border-line-strong hover:-translate-y-0.5 hover:shadow-md'} ${
          isDragging ? 'opacity-25' : ''
        } cursor-grab active:cursor-grabbing`}
      >
        “{textOf(id)}”
      </button>
    )
  }

  return (
    <div>
      <div
        data-drop="tray"
        className={`min-h-[56px] rounded-xl border-2 border-dashed p-2 transition-colors ${drag?.over === 'tray' ? 'border-accent bg-accent-soft/50' : 'border-line'}`}
      >
        {unsorted.length ? (
          <div className="grid gap-2">{unsorted.map((s) => card(s.id))}</div>
        ) : (
          <p className="py-3 text-center text-[13px] font-medium text-good">All sorted ✓</p>
        )}
      </div>
      <p className="mt-2 flex items-center justify-center gap-2 text-center text-[12px] text-ink-3">
        {picked ? 'Now tap a bin' : 'Drag each into a bin, or tap it then tap a bin'}
        {picked && tags[picked] && (
          <button type="button" className="rounded border border-line-strong px-1.5 py-0.5 text-ink-2" onClick={() => dropPicked('tray')}>
            unsort
          </button>
        )}
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {BINS.map((b) => {
          const inBin = statements.filter((s) => tags[s.id] === b.id)
          const hot = drag?.over === b.id || (!!picked && tags[picked] !== b.id)
          return (
            <div
              key={b.id}
              data-drop={b.id}
              className={`flex min-h-[132px] flex-col rounded-xl border-2 p-2 transition-all ${drag?.over === b.id ? 'scale-[1.03] shadow-lg' : ''}`}
              style={{ borderColor: hot ? b.color : 'var(--color-line)', background: drag?.over === b.id ? b.soft : 'var(--color-surface)' }}
            >
              <button
                type="button"
                onClick={() => dropPicked(b.id)}
                disabled={!picked}
                className="relative flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-center disabled:cursor-default"
                aria-label={`Put in ${b.label}`}
              >
                <BinIcon tag={b.id} size={26} />
                <b className="text-[14px]" style={{ color: b.color }}>
                  {b.label}
                </b>
                <span className="text-[11px] leading-tight text-ink-3">{b.hint}</span>
                <span className="absolute top-0 right-0 rounded-full bg-sunken px-1.5 text-[11.5px] font-bold tabular-nums">{inBin.length}</span>
              </button>
              <div className="mt-1.5 grid gap-1.5">{inBin.map((s) => card(s.id, true))}</div>
            </div>
          )
        })}
      </div>

      {drag?.moved &&
        createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 rotate-2 rounded-lg border border-accent bg-surface px-3 py-2.5 text-[14px] shadow-2xl"
          style={{ left: drag.x - drag.ox, top: drag.y - drag.oy, width: drag.w }}
        >
          “{textOf(drag.id)}”
        </div>,
          document.body,
        )}
    </div>
  )
}
