'use client'

import { applyAll, seedWard, templateSbar, WardError, type Command, type Fact, type Sbar, type Ward } from '@thread/engine'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * One ward shared by the three workflows.
 *   saved     the THREAD API replays the ward from PostgreSQL; every step is stored
 *   practice  the same engine replays a command log kept in this browser (GitHub Pages, or when the API is down)
 */

export const STATIC = process.env.NEXT_PUBLIC_DATA_MODE === 'static'
export type Mode = 'saved' | 'practice'

export interface SbarResult {
  draft: Sbar
  source: 'gemini' | 'template'
  model: string | null
  fallbackReason: string | null
  validation: string[]
  facts: Fact[]
}

export interface Health {
  status: 'ok' | 'degraded'
  database: { ok: boolean; provider: 'vultr' | 'postgres' | 'pglite'; error?: string }
  gemini: { configured: boolean; model: string }
}

interface Ctx {
  ward: Ward | null
  mode: Mode
  busy: boolean
  error: string | null
  health: Health | null
  send: (cmd: Command) => Promise<boolean>
  sbar: (concernId: string) => Promise<SbarResult>
  reset: () => Promise<void>
  practise: () => void
  dismiss: () => void
}

const WardContext = createContext<Ctx | null>(null)
export const useWard = () => {
  const c = useContext(WardContext)
  if (!c) throw new Error('useWard outside WardProvider')
  return c
}

const KEY_ID = 'thread:ward:id'
const KEY_LOG = 'thread:ward:log'
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    } catch {
      // Private mode: the ward still works, it just won't survive a reload.
    }
  },
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    throw new ApiError(0, 'The THREAD server can’t be reached. Nothing was saved.')
  }
  const data = (await res.json().catch(() => null)) as (T & { message?: string }) | null
  if (!res.ok) throw new ApiError(res.status, data?.message ?? (res.status >= 500 ? 'The THREAD server can’t be reached. Nothing was saved.' : `Request failed (${res.status}).`))
  return data as T
}

type Saved = { id: string; seq: number; ward: Ward }

export function WardProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(STATIC ? 'practice' : 'saved')
  const [ward, setWard] = useState<Ward | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const saved = useRef<{ id: string; seq: number } | null>(null)
  const log = useRef<Command[]>([])

  const startPractice = useCallback(() => {
    let cmds: Command[] = []
    try {
      cmds = JSON.parse(store.get(KEY_LOG) ?? '[]') as Command[]
      setWard(applyAll(seedWard(), cmds))
    } catch {
      cmds = []
      setWard(seedWard())
    }
    log.current = cmds
    setMode('practice')
  }, [])

  const boot = useCallback(async () => {
    if (STATIC) return startPractice()
    setBusy(true)
    try {
      fetch('/api/health', { cache: 'no-store' })
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => setHealth(null))
      const id = store.get(KEY_ID)
      let w: Saved
      try {
        w = id ? await api<Saved>(`/workspaces/${id}`) : await api<Saved>('/workspaces', {})
      } catch (e) {
        if ((e as ApiError).status !== 404) throw e
        w = await api<Saved>('/workspaces', {})
      }
      store.set(KEY_ID, w.id)
      saved.current = { id: w.id, seq: w.seq }
      setWard(w.ward)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [startPractice])

  useEffect(() => {
    // Loading the ward from the server (or this browser) is synchronising with an external system.
    // oxlint-disable-next-line react/set-state-in-effect
    void boot()
  }, [boot])

  const send = useCallback(
    async (cmd: Command) => {
      setBusy(true)
      setError(null)
      try {
        if (mode === 'practice') {
          const w = applyAll(ward ?? seedWard(), [cmd])
          log.current = [...log.current, cmd]
          store.set(KEY_LOG, JSON.stringify(log.current))
          setWard(w)
        } else {
          const s = saved.current!
          const w = await api<Saved>(`/workspaces/${s.id}/commands`, { seq: s.seq, command: cmd })
          saved.current = { id: w.id, seq: w.seq }
          setWard(w.ward)
        }
        return true
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) void boot()
        setError(e instanceof WardError || e instanceof ApiError ? e.message : (e as Error).message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [mode, ward, boot],
  )

  const sbar = useCallback(
    async (concernId: string): Promise<SbarResult> => {
      if (mode === 'practice' || !saved.current)
        return { draft: templateSbar(ward!, concernId), source: 'template', model: null, fallbackReason: 'Practice mode runs in your browser, so AI drafting is off.', validation: [], facts: [] }
      return api<SbarResult>(`/workspaces/${saved.current.id}/sbar`, { concernId })
    },
    [mode, ward],
  )

  const reset = useCallback(async () => {
    if (mode === 'practice') {
      store.set(KEY_LOG, null)
      log.current = []
      setWard(seedWard())
      return
    }
    store.set(KEY_ID, null)
    await boot()
  }, [mode, boot])

  const value = useMemo<Ctx>(
    () => ({ ward, mode, busy, error, health, send, sbar, reset, practise: startPractice, dismiss: () => setError(null) }),
    [ward, mode, busy, error, health, send, sbar, reset, startPractice],
  )
  return <WardContext.Provider value={value}>{children}</WardContext.Provider>
}
