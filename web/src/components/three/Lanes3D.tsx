'use client'

import type { ChartPoint, DimensionDef } from '@thread/engine'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { createStage, css, ease, reducedMotion, webglAvailable } from './core'

const DIM_VAR: Record<string, [string, string]> = {
  mobility: ['--color-mobility', '#2d68ad'],
  intake: ['--color-intake', '#a3611a'],
  engagement: ['--color-engagement', '#7a4b9e'],
  orientation: ['--color-orientation', '#a3405f'],
  fluids: ['--color-fluids', '#1f7a8c'],
}

const H = 2.4 // world height of 100%
const GAP = 1.75 // between lanes
const STEP = 0.95 // between time points

type Hover = { x: number; y: number; w: number; title: string; body: string } | null

/**
 * One lane per area of the resident's life. Each lane has a translucent "usual" band; beads are the observations.
 * Beads that appear for the first time drop in. Drag to turn, hover a bead to read it.
 */
export default function Lanes3D({ points, dimensions, onFallback }: { points: ChartPoint[]; dimensions: DimensionDef[]; onFallback: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const labelBox = useRef<HTMLDivElement>(null)
  const seen = useRef<Set<string>>(new Set())
  const first = useRef(true)
  const [hover, setHover] = useState<Hover>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    if (!webglAvailable()) {
      onFallback()
      return
    }
    const n = points.length
    const width = (n - 1) * STEP
    const lanes = dimensions.map((d, i) => ({ d, z: (i - (dimensions.length - 1) / 2) * GAP }))
    // Frame the whole width for this container's shape.
    const aspect = Math.max(0.8, el.clientWidth / Math.max(1, el.clientHeight))
    const span = width + 3.4
    const FOV = 22
    const dist = Math.max(10, (span / (2 * Math.tan((FOV * Math.PI) / 360) * aspect)) * 1.05)
    const stage = createStage(el, {
      fov: FOV,
      camera: [0, dist * 0.34, dist],
      target: [0, H * 0.62, 0],
      base: [0.05, -0.22],
      orbit: { yaw: 0.7, pitch: 0.25 },
    })
    const { root } = stage
    root.position.x = 0
    const xOf = (i: number) => i * STEP - width / 2
    const yOf = (v: number) => (v / 100) * H
    const accent = new THREE.Color(css('--color-accent', '#0e5a61'))

    // The divide between last week and this week.
    const firstObserved = points.findIndex((p) => p.phase === 'observed')
    if (firstObserved > 0) {
      const x = (xOf(firstObserved - 1) + xOf(firstObserved)) / 2
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(lanes.length * GAP + 0.8, H * 1.25),
        new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }),
      )
      wall.rotation.y = Math.PI / 2
      wall.position.set(x, (H * 1.25) / 2, 0)
      root.add(wall)
    }

    const beads: { mesh: THREE.Mesh; base: number; born: number; title: string; body: string }[] = []
    const beadGeom = new THREE.SphereGeometry(0.13, 24, 16)
    const bigGeom = new THREE.SphereGeometry(0.2, 28, 18)
    const now = performance.now() / 1000
    const still = reducedMotion()

    for (const { d, z } of lanes) {
      const [v, f] = DIM_VAR[d.key] ?? ['--color-ink-3', '#5f6b77']
      const c = new THREE.Color(css(v, f))
      // The usual band: 85 to 115.
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.9, yOf(30), 0.55),
        new THREE.MeshStandardMaterial({ color: accent, transparent: true, opacity: 0.1, depthWrite: false }),
      )
      band.position.set(0, yOf(100), z)
      root.add(band)

      const pts = points.map((p, i) => ({ p, i, v: p.values[d.key] })).filter((x) => x.v != null) as { p: ChartPoint; i: number; v: number }[]
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts.map(({ i, v }) => new THREE.Vector3(xOf(i), yOf(v), z)), false, 'catmullrom', 0.3)
        root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 14, 0.045, 10, false), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })))
      }
      for (const { p, i, v } of pts) {
        const observed = p.phase === 'observed'
        const key = `${d.key}:${p.key}`
        const fresh = !first.current && !seen.current.has(key)
        seen.current.add(key)
        const m = new THREE.Mesh(
          observed ? bigGeom : beadGeom,
          new THREE.MeshStandardMaterial({ color: observed ? c : 0xffffff, emissive: c, emissiveIntensity: observed ? 0.2 : 0.35, roughness: 0.3 }),
        )
        m.position.set(xOf(i), yOf(v), z)
        root.add(m)
        if (observed) {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, yOf(v), 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35 }))
          stem.position.set(xOf(i), yOf(v) / 2, z)
          root.add(stem)
        }
        beads.push({
          mesh: m,
          base: yOf(v),
          born: fresh && !still ? now : -1,
          title: `${d.label} · ${p.label}${observed ? '' : ' (last week)'}`,
          body: observed ? (p.notes[d.key] ?? `${v}% of usual`) : `${v}% of usual`,
        })
      }
    }
    first.current = false

    // Labels: lane names at the left, time labels along the front.
    const labels: { el: HTMLElement; at: THREE.Vector3 }[] = []
    const lb = labelBox.current!
    lb.innerHTML = ''
    const addLabel = (text: string, at: THREE.Vector3, cls: string, color?: string) => {
      const s = document.createElement('span')
      s.textContent = text
      s.className = `pointer-events-none absolute top-0 left-0 whitespace-nowrap ${cls}`
      if (color) s.style.color = color
      lb.appendChild(s)
      labels.push({ el: s, at })
    }
    for (const { d, z } of lanes) {
      const [v, f] = DIM_VAR[d.key] ?? ['--color-ink-3', '#5f6b77']
      addLabel(d.label, new THREE.Vector3(-width / 2 - 0.3, yOf(115) + 0.12, z), 'text-[12px] font-semibold -translate-y-full rounded bg-surface/85 px-1', css(v, f))
    }
    const front = lanes[lanes.length - 1]!.z + 0.75
    points.forEach((p, i) => {
      if (p.phase === 'observed' || i === 0 || i === firstObserved - 1)
        addLabel(p.label, new THREE.Vector3(xOf(i), 0, front), `text-[11.5px] -translate-x-1/2 ${p.phase === 'observed' ? 'font-semibold text-ink' : 'text-ink-3'}`)
    })
    addLabel(firstObserved < 0 ? 'last week · her usual' : 'last week', new THREE.Vector3(firstObserved < 0 ? 0 : xOf(Math.max(0, firstObserved - 1) / 2), H * 1.32, lanes[0]!.z), 'text-[11.5px] text-ink-3 -translate-x-1/2')

    // Hover a bead.
    const ray = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    const onMove = (e: PointerEvent) => {
      const r = stage.renderer.domElement.getBoundingClientRect()
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(mouse, stage.camera)
      const hit = ray.intersectObjects(beads.map((b) => b.mesh))[0]
      const b = hit && beads.find((x) => x.mesh === hit.object)
      setHover(b ? { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, title: b.title, body: b.body } : null)
    }
    const onLeave = () => setHover(null)
    stage.renderer.domElement.addEventListener('pointermove', onMove)
    stage.renderer.domElement.addEventListener('pointerleave', onLeave)

    stage.onFrame(() => {
      const t = performance.now() / 1000
      for (const b of beads) {
        if (b.born < 0) continue
        const k = (t - b.born) / 0.7
        b.mesh.position.y = b.base + (1 - ease.outBack(k)) * 2.2
        b.mesh.scale.setScalar(0.4 + 0.6 * ease.outCubic(k * 1.5))
        if (k >= 1) b.born = -1
      }
      for (const l of labels) {
        const s = stage.project(l.at)
        l.el.style.transform = `translate(${s.x}px, ${s.y}px)`
      }
    })

    return () => {
      stage.renderer.domElement.removeEventListener('pointermove', onMove)
      stage.renderer.domElement.removeEventListener('pointerleave', onLeave)
      stage.dispose()
    }
  }, [points, dimensions, onFallback])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={box} className="absolute inset-0" />
      <div ref={labelBox} className="pointer-events-none absolute inset-0 [&>span]:will-change-transform" aria-hidden="true" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg"
          style={{ left: Math.max(4, Math.min(hover.x + 14, hover.w - 270)), top: Math.max(4, hover.y - 50) }}
        >
          <b className="block text-ink">{hover.title}</b>
          <span className="text-ink-2">{hover.body}</span>
        </div>
      )}
    </div>
  )
}
