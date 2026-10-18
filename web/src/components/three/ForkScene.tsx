'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createStage, css, ease, growingTube, reducedMotion, webglAvailable } from './core'

type Label = { key: string; text: string; tone: string }

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/**
 * The idea in 3D: a resident's usual week runs inside a band, dips on Monday, then forks into two futures.
 * `taken` lights up the branch this attempt followed and ghosts the other.
 */
export default function ForkScene({ taken = null, labels = true, decisionLabel = 'Monday 11:00' }: { taken?: 'persist' | 'resolve' | null; labels?: boolean; decisionLabel?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const tags = useRef<Record<string, HTMLSpanElement | null>>({})
  const [ok] = useState(() => webglAvailable())

  useEffect(() => {
    const el = box.current
    if (!el || !ok) return
    const stage = createStage(el, { camera: [0, 0.6, 13.5], target: [0.3, -1.1, 0], base: [0.12, -0.32], orbit: { yaw: 0.7, pitch: 0.3 } })
    const { root } = stage
    const color = (n: string, f: string) => new THREE.Color(css(n, f))
    const accent = color('--color-accent', '#0e5a61')
    const amber = color('--color-intake', '#a3611a')
    const good = color('--color-good', '#2d7546')
    const poor = color('--color-poor', '#a83434')

    // Her usual: a translucent band with crisp edges.
    const bandGeom = new THREE.BoxGeometry(13, 0.95, 2.4)
    root.add(new THREE.Mesh(bandGeom, new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.09, depthWrite: false })))
    root.add(new THREE.LineSegments(new THREE.EdgesGeometry(bandGeom), new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.28 })))

    const usualCurve = new THREE.CatmullRomCurve3([V(-6.2, 0.05, 0), V(-4.6, -0.18, 0.1), V(-3, 0.14, -0.05), V(-1.5, -0.08, 0.05), V(-0.3, 0.04, 0)])
    const dipCurve = new THREE.CatmullRomCurve3([V(-0.3, 0.04, 0), V(0.45, -0.5, 0), V(1.0, -1.35, 0), V(1.35, -1.65, 0)])
    const resolveCurve = new THREE.CatmullRomCurve3([V(1.35, -1.65, 0), V(2.4, -1.3, 0.35), V(3.6, -0.35, 0.55), V(5, 0.02, 0.5), V(6.3, 0, 0.5)])
    const persistCurve = new THREE.CatmullRomCurve3([V(1.35, -1.65, 0), V(2.4, -2.05, -0.35), V(3.6, -2.55, -0.55), V(5, -2.85, -0.5), V(6.3, -3.05, -0.5)])

    const mat = (c: THREE.Color, opacity = 1) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1, transparent: opacity < 1, opacity })
    const usual = growingTube(usualCurve, 0.085, mat(accent))
    const dip = growingTube(dipCurve, 0.085, mat(amber), 60)
    const res = growingTube(resolveCurve, 0.07, mat(good, taken === 'persist' ? 0.18 : 1))
    const per = growingTube(persistCurve, 0.07, mat(poor, taken === 'resolve' ? 0.18 : 1))
    for (const t of [usual, dip, res, per]) root.add(t.mesh)

    // Events along the usual week, and the decision point that pulses.
    const beadGeom = new THREE.SphereGeometry(0.14, 24, 16)
    const beads = [0.12, 0.34, 0.56, 0.78].map((u) => {
      const m = new THREE.Mesh(beadGeom, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: accent, emissiveIntensity: 0.25 }))
      m.position.copy(usualCurve.getPoint(u))
      root.add(m)
      return m
    })
    const decision = new THREE.Mesh(new THREE.SphereGeometry(0.24, 32, 20), new THREE.MeshStandardMaterial({ color: amber, emissive: amber, emissiveIntensity: 0.35 }))
    decision.position.copy(dipCurve.getPoint(1))
    root.add(decision)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 12, 64), new THREE.MeshBasicMaterial({ color: amber, transparent: true, opacity: 0.6 }))
    ring.position.copy(decision.position)
    root.add(ring)
    const ends = [resolveCurve.getPoint(1), persistCurve.getPoint(1)].map((p, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), mat(i === 0 ? good : poor, (i === 0 ? taken === 'persist' : taken === 'resolve') ? 0.2 : 1))
      m.position.copy(p)
      root.add(m)
      return m
    })

    const still = reducedMotion()
    const anchors: Record<string, THREE.Vector3> = {
      usual: V(-5.2, 0.85, 0),
      decision: decision.position.clone().add(V(0.2, -0.75, 0)),
      resolve: resolveCurve.getPoint(1).add(V(-0.4, 0.65, 0)),
      persist: persistCurve.getPoint(1).add(V(-0.4, -0.6, 0)),
    }
    stage.onFrame((t) => {
      const p = still ? 1 : t
      usual.set(ease.outCubic(p / 1.3))
      dip.set(ease.outCubic((p - 1.2) / 0.6))
      res.set(ease.outCubic((p - 1.9) / 1.1))
      per.set(ease.outCubic((p - 1.9) / 1.1))
      beads.forEach((b, i) => b.scale.setScalar(ease.outBack((p - 0.2 - i * 0.25) / 0.4)))
      const d = ease.outBack((p - 1.7) / 0.5)
      decision.scale.setScalar(d)
      ends.forEach((e) => e.scale.setScalar(ease.outBack((p - 2.9) / 0.4)))
      const pulse = (t * 0.8) % 1
      ring.scale.setScalar(d * (1 + pulse * 0.9))
      ;(ring.material as THREE.MeshBasicMaterial).opacity = still ? 0.5 : 0.7 * (1 - pulse) * (p > 1.8 ? 1 : 0)
      ring.lookAt(stage.camera.position)
      for (const [k, a] of Object.entries(anchors)) {
        const tag = tags.current[k]
        if (!tag) continue
        const s = stage.project(a)
        tag.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`
        tag.style.opacity = String(k === 'usual' ? Math.min(1, p) : k === 'decision' ? Math.min(1, Math.max(0, (p - 1.8) * 2)) : Math.min(1, Math.max(0, (p - 2.8) * 2)))
      }
    })
    return () => stage.dispose()
  }, [taken, ok])

  const LABELS: Label[] = [
    { key: 'usual', text: 'usual', tone: 'var(--color-accent)' },
    { key: 'decision', text: decisionLabel, tone: 'var(--color-ink)' },
    { key: 'resolve', text: 'resolves', tone: 'var(--color-good)' },
    { key: 'persist', text: 'persists', tone: 'var(--color-poor)' },
  ]

  if (!ok)
    return (
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- text fallback for the WebGL scene
      <div className="grid h-full place-items-center text-[13px] text-ink-3" role="img" aria-label="Usual week, a dip, then two possible futures: it resolves or it persists.">
        usual · dip · resolves or persists
      </div>
    )

  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a WebGL scene with a text alternative
    <div ref={box} className="relative h-full w-full overflow-hidden" role="img" aria-label="A resident's usual week runs inside a band, dips on Monday, then forks: it resolves, or it persists. Drag to turn.">
      {labels &&
        LABELS.map((l) => (
          <span
            key={l.key}
            ref={(n) => {
              tags.current[l.key] = n
            }}
            aria-hidden="true"
            className={`pointer-events-none absolute top-0 left-0 rounded-full px-2 py-0.5 text-[12.5px] font-semibold whitespace-nowrap opacity-0 ${
              taken && ((l.key === 'resolve' && taken === 'persist') || (l.key === 'persist' && taken === 'resolve')) ? 'line-through decoration-1' : ''
            } ${l.key === 'decision' ? 'bg-surface/90 shadow-sm' : ''}`}
            style={{ color: l.tone }}
          >
            {l.text}
          </span>
        ))}
    </div>
  )
}
