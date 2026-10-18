import * as THREE from 'three'

/** Small shared runtime for the 3D views: renderer, resize, a pausable loop, drag-to-orbit and clean disposal. */

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export const css = (name: string, fallback: string) =>
  (typeof window !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue(name).trim()) || fallback

export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  root: THREE.Group
  /** Called every frame with elapsed seconds. */
  onFrame: (fn: (t: number) => void) => void
  /** Project a world point to CSS pixels inside the container. */
  project: (p: THREE.Vector3) => { x: number; y: number; visible: boolean }
  size: () => { w: number; h: number }
  dispose: () => void
}

export function createStage(
  container: HTMLElement,
  opts: {
    fov?: number
    camera: [number, number, number]
    target?: [number, number, number]
    /** Resting rotation of the scene: [pitch, yaw] in radians. */
    base?: [number, number]
    orbit?: { yaw: number; pitch: number }
  },
): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'pan-y'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(opts.fov ?? 35, 1, 0.1, 100)
  camera.position.set(...opts.camera)
  const target = new THREE.Vector3(...(opts.target ?? [0, 0, 0]))
  camera.lookAt(target)

  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcd8cc, 2.2))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(4, 8, 6)
  scene.add(key)

  const root = new THREE.Group()
  root.rotation.set(opts.base?.[0] ?? 0, opts.base?.[1] ?? 0, 0)
  scene.add(root)

  let w = 1
  let h = 1
  const resize = () => {
    w = Math.max(1, container.clientWidth)
    h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = `${w}px`
    renderer.domElement.style.height = `${h}px`
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)

  // Drag to orbit, within limits, easing back toward the resting angle.
  const orbit = opts.orbit ?? { yaw: 0.6, pitch: 0.25 }
  const rest = { yaw: root.rotation.y, pitch: root.rotation.x }
  const want = { ...rest }
  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, yaw: want.yaw, pitch: want.pitch }
    renderer.domElement.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent) => {
    if (!drag) return
    want.yaw = Math.max(rest.yaw - orbit.yaw, Math.min(rest.yaw + orbit.yaw, drag.yaw + (e.clientX - drag.x) * 0.006))
    want.pitch = Math.max(rest.pitch - orbit.pitch, Math.min(rest.pitch + orbit.pitch, drag.pitch + (e.clientY - drag.y) * 0.004))
  }
  const up = () => {
    drag = null
  }
  renderer.domElement.addEventListener('pointerdown', down)
  renderer.domElement.addEventListener('pointermove', move)
  renderer.domElement.addEventListener('pointerup', up)
  renderer.domElement.addEventListener('pointercancel', up)
  renderer.domElement.style.cursor = 'grab'

  const frames: ((t: number) => void)[] = []
  const still = reducedMotion()
  const clock = new THREE.Clock()
  let raf = 0
  let visible = true
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting
    if (visible && !raf) loop()
  })
  io.observe(container)

  const loop = () => {
    raf = 0
    if (!visible) return
    const t = still ? 100 : clock.getElapsedTime()
    if (!drag) {
      want.yaw += (rest.yaw - want.yaw) * 0.004
      want.pitch += (rest.pitch - want.pitch) * 0.004
    }
    root.rotation.y += (want.yaw - root.rotation.y) * 0.12
    root.rotation.x += (want.pitch - root.rotation.x) * 0.12
    for (const f of frames) f(t)
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const v = new THREE.Vector3()
  return {
    scene,
    camera,
    renderer,
    root,
    onFrame: (fn) => frames.push(fn),
    project: (p) => {
      v.copy(p).applyMatrix4(root.matrixWorld).project(camera)
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, visible: v.z < 1 }
    },
    size: () => ({ w, h }),
    dispose: () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointermove', move)
      renderer.domElement.removeEventListener('pointerup', up)
      renderer.domElement.removeEventListener('pointercancel', up)
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

export const ease = {
  outCubic: (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3),
}

/** A tube along a curve that can be "drawn" progressively (0..1). */
export function growingTube(curve: THREE.Curve<THREE.Vector3>, radius: number, material: THREE.Material, segments = 160) {
  const geom = new THREE.TubeGeometry(curve, segments, radius, 12, false)
  const mesh = new THREE.Mesh(geom, material)
  const total = geom.index!.count
  const set = (p: number) => geom.setDrawRange(0, Math.floor((total * Math.min(1, Math.max(0, p))) / 6 / 12) * 6 * 12)
  set(1)
  return { mesh, set }
}
