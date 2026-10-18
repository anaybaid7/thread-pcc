'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useWard } from '@/lib/ward'

/**
 * The self-running demo. It drives the real screens (the same buttons a person would press, marked with data-demo),
 * moves a visible cursor to each one, and captions what is happening. Every step goes through the ward like any
 * other action, so in saved mode it is stored, and Gemini drafts the SBAR live.
 */

interface Ctx {
  running: boolean
  start: (fast?: boolean) => Promise<void>
  stop: () => void
}

const DemoContext = createContext<Ctx | null>(null)
export const useDemo = () => {
  const c = useContext(DemoContext)
  if (!c) throw new Error('useDemo outside DemoProvider')
  return c
}

class Stopped extends Error {}

const at = (sel: string) => document.querySelector<HTMLElement>(`[data-demo="${sel}"]`)
const setNative = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const { ward, reset } = useWard()
  const router = useRouter()
  const path = usePathname()
  const [running, setRunning] = useState(false)
  const [caption, setCaption] = useState<{ text: string; step: string } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number; down: boolean } | null>(null)
  const token = useRef(0)
  const ready = useRef(false)
  const pathRef = useRef(path)
  useEffect(() => {
    ready.current = !!ward
    pathRef.current = path
  }, [ward, path])

  const stop = useCallback(() => {
    token.current++
    setRunning(false)
    setCaption(null)
    setCursor(null)
  }, [])

  const start = useCallback(async (fast = false) => {
    const mine = ++token.current
    // Fast mode is for tests: the same steps, a tenth of the pauses.
    const k = fast ? 0.1 : 1
    const live = () => {
      if (token.current !== mine) throw new Stopped()
    }
    const sleep = async (ms: number) => {
      const end = Date.now() + ms * k
      while (Date.now() < end) {
        live()
        await new Promise((r) => setTimeout(r, Math.max(0, Math.min(100, end - Date.now()))))
      }
      live()
    }
    const find = async (sel: string, timeout = 10_000) => {
      const end = Date.now() + timeout
      for (;;) {
        const el = at(sel)
        if (el && !(el as HTMLButtonElement).disabled) return el
        if (Date.now() > end) throw new Error(`Demo: nothing to press for "${sel}"`)
        await new Promise((r) => setTimeout(r, 100))
        live()
      }
    }
    const point = async (el: HTMLElement) => {
      el.scrollIntoView({ block: 'center', behavior: fast ? 'instant' : 'smooth' })
      await sleep(450)
      const b = el.getBoundingClientRect()
      setCursor({ x: b.left + Math.min(b.width / 2, 60), y: b.top + b.height / 2, down: false })
      await sleep(650)
    }
    const click = async (sel: string, after = 450) => {
      const el = await find(sel)
      await point(el)
      setCursor((c) => (c ? { ...c, down: true } : c))
      await sleep(120)
      el.click()
      setCursor((c) => (c ? { ...c, down: false } : c))
      await sleep(after)
    }
    const type = async (sel: string, text: string) => {
      const el = (await find(sel)) as HTMLInputElement
      await point(el)
      el.focus()
      for (let i = 1; i <= text.length; i++) {
        setNative(el, text.slice(0, i))
        await sleep(55)
      }
      await sleep(300)
    }
    const choose = async (sel: string, value: string) => {
      const el = (await find(sel)) as HTMLSelectElement
      await point(el)
      setNative(el, value)
      await sleep(500)
    }
    // Captions stay up long enough to read aloud before the next one replaces them.
    let shownAt = 0
    let need = 0
    const say = async (step: string, text: string) => {
      await new Promise((r) => setTimeout(r, Math.max(0, shownAt + need - Date.now())))
      live()
      setCaption({ step, text })
      shownAt = Date.now()
      need = Math.max(2200, text.split(' ').length * 330) * k
    }
    const settle = async () => {
      await new Promise((r) => setTimeout(r, Math.max(0, shownAt + need - Date.now())))
      live()
    }
    const go = async (nav: string, route: string) => {
      await click(nav, 200)
      const end = Date.now() + 8000
      while (!pathRef.current.startsWith(route.replace(/\/$/, '') || '/') && Date.now() < end) await new Promise((r) => setTimeout(r, 100))
      setCursor(null)
      window.scrollTo({ top: 0 })
      await sleep(600)
    }

    setRunning(true)
    try {
      await reset()
      router.push('/')
      while (!ready.current) await new Promise((r) => setTimeout(r, 100))
      await sleep(900)

      await say('The ward', 'Birch wing, Tuesday 10:40. Each row is one concern, and how far it has got from the person who noticed it to an outcome.')
      await point(await find('lane-ruth'))
      await say('The ward', 'Ruth’s report has waited over an hour for a nurse. Harold’s recheck is overdue. Arthur’s drinks were offered three times and never measured.')
      await settle()

      await go('nav-spot', '/spot')
      await say('1 · Spot it', 'Maya, a PSW, checks Evelyn against Evelyn’s own usual, not a population norm.')
      await click('resident-evelyn', 700)
      await click('mark-mobility-different', 250)
      await click('finding-mobility-0')
      await click('mark-eating-different', 250)
      await click('finding-eating-0')
      await click('mark-mood-different', 250)
      await click('finding-mood-0')
      await click('mark-thinking-usual')
      await type('quote', 'I’ll stay put a bit, dear.')
      await say('1 · Spot it', 'Drinking and pain weren’t checked, so they go to the nurse as not known. Never as fine.')
      await settle()
      await click('send', 900)
      await say('1 · Spot it', 'One tap, and it is on the nurse’s board.')
      await point(await find('live-evelyn'))
      await settle()

      await go('nav-size', '/size')
      await say('2 · Size it up', 'Priya’s board is ordered by reasons she can check. There is no risk score.')
      await click('board-evelyn', 900)
      await choose('check-kind', 'temp')
      await type('check-value', '37.6')
      await say('2 · Size it up', '37.6 is normal for most people. It is above Evelyn’s usual of 36.2 to 36.8.')
      await settle()
      await click('record', 800)
      await point(await find('close-hint'))
      await say('2 · Size it up', 'She can’t close it. Only a recorded outcome closes a concern, not a task done.')
      await settle()
      await click('decide-escalate')
      await click('draft', 300)
      await say('2 · Size it up', 'Gemini drafts the SBAR from the recorded facts only. A number or a diagnosis that isn’t in the record gets the draft thrown out.')
      await point(await find('sbar', 40_000))
      await settle()
      await click('submit-plan', 900)

      await go('nav-handover', '/handover')
      await say('3 · Carry it forward', 'Three o’clock. Shift change.')
      await click('advance', 900)
      await say('3 · Carry it forward', 'The evening nurse gets every open item. Arthur: offered three times, never measured. An offer is an attempt, not an outcome.')
      await point(await find('ho-arthur'))
      await settle()
      await say('3 · Carry it forward', 'Each one is taken on by name. Nothing goes unowned.')
      for (let i = 0; i < 12 && at('take'); i++) await click('take', 350)
      await settle()

      await go('nav-home', '/')
      await point(await find('lane-evelyn'))
      await say('The ward', 'Evelyn’s recheck is now Daniel’s, by name. What is still open is visible, not lost.')
      await say('The ward', 'Every step is stored and can be replayed. THREAD: catch it early, then don’t drop it.')
      await settle()
      await sleep(1500)
      stop()
      document.body.dataset.demo = 'done'
    } catch (e) {
      if (!(e instanceof Stopped)) {
        console.error(e)
        stop()
      }
    }
  }, [reset, router, stop])

  // /?demo starts it straight away, for hands-free recording (?demo=fast for tests).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('demo')
    if (!ward || running || q === null) return
    window.history.replaceState(null, '', window.location.pathname)
    // Starting from the URL is an external trigger, like a click.
    // oxlint-disable-next-line react/set-state-in-effect
    void start(q === 'fast')
  }, [ward, running, start])

  const value = useMemo(() => ({ running, start, stop }), [running, start, stop])
  return (
    <DemoContext.Provider value={value}>
      {children}
      {running && cursor && (
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          className="pointer-events-none fixed z-[60] transition-[left,top,transform] duration-[600ms] ease-[cubic-bezier(.3,.7,.2,1)]"
          style={{ left: cursor.x - 3, top: cursor.y - 2, transform: cursor.down ? 'scale(0.85)' : 'none' }}
        >
          <path d="M3 2l14 8.5-6.2 1.3L8 18z" fill="var(--color-ink)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}
      {running && caption && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <output key={caption.text} className="enter block max-w-[860px] bg-ink px-5 py-3 text-[17px] leading-snug text-white shadow-lg">
            <span className="mr-3 font-mono text-[12px] tracking-wide text-white/60 uppercase">{caption.step}</span>
            {caption.text}
          </output>
        </div>
      )}
    </DemoContext.Provider>
  )
}
