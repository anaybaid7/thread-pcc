// Data access. Live mode calls the FastAPI service through /api. Static mode (GitHub Pages) reads the snapshot
// the engine exported at build time; anything that would write is refused with a clear message.

export const STATIC = process.env.NEXT_PUBLIC_DATA_MODE === 'static'
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/** File name a snapshot uses for a request: '/queue?as_of=2026-10-20T09:00:00' -> 'queue@2026-10-20T0900'. */
export function snapshotKey(path: string): string {
  const [route, query = ''] = path.replace(/^\//, '').split('?')
  const asOf = new URLSearchParams(query).get('as_of')
  const name = (route ?? '').replace(/\//g, '__')
  return asOf ? `${name}@${asOf.replace(/:\d\d$/, '').replace(/:/g, '')}` : name
}

export async function get<T>(path: string): Promise<T> {
  const url = STATIC ? `${BASE}/snapshot/${snapshotKey(path)}.json` : `/api${path}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    let message = res.status === 404 ? 'Not found' : `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') message = body.detail
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    if (STATIC && res.status === 404) message = 'Not part of the static preview. Run THREAD locally to explore further.'
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  if (STATIC) throw new ApiError('This is the static preview. Run THREAD locally (make dev) to record actions.', 405)
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const b = await res.json()
      message = typeof b?.detail === 'string' ? b.detail : (b?.detail?.[0]?.msg ?? message)
    } catch {
      // Keep the generic message.
    }
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export function withAsOf(path: string, asOf: string | null): string {
  if (!asOf) return path
  return `${path}${path.includes('?') ? '&' : '?'}as_of=${encodeURIComponent(asOf)}`
}
