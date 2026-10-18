'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/** Tilt an element toward the pointer (pair with the `.tilt` class). */
export function useTilt<T extends HTMLElement>(max = 7) {
  const ref = useRef<T>(null)
  const onPointerMove = (e: ReactPointerEvent<T>) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 2 * max}deg`)
    el.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 2 * max}deg`)
  }
  const onPointerLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }
  return { ref, onPointerMove, onPointerLeave }
}

function reduced() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Animate from 0 to `to` once mounted (or whenever `to` changes). */
export function useCountUp(to: number, ms = 900) {
  const [v, setV] = useState(() => (reduced() ? to : 0))
  useEffect(() => {
    if (reduced()) return
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return reduced() ? to : v
}

export function toneOf(earned: number, max: number) {
  const p = max ? earned / max : 0
  return p >= 0.8 ? 'good' : p >= 0.5 ? 'mid' : 'poor'
}

/** An animated score ring. */
export function Ring({ value, max, size = 112, stroke = 10, label }: { value: number; max: number; size?: number; stroke?: number; label?: string }) {
  const shown = useCountUp(value)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const tone = toneOf(value, max)
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an SVG score ring with a text alternative
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label ?? `${value} out of ${max}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`var(--color-${tone})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(shown / max) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dy={size > 80 ? '0.1em' : '0.35em'} textAnchor="middle" fontSize={size * 0.27} fontWeight="700" fill="var(--color-ink)" fontFamily="var(--font-serif)">
        {shown}
      </text>
      {size > 80 && (
        <text x="50%" y="50%" dy="1.6em" textAnchor="middle" fontSize={size * 0.1} fill="var(--color-ink-3)">
          of {max}
        </text>
      )}
    </svg>
  )
}
