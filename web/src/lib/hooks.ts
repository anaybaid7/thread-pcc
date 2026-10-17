'use client'

import { useQuery } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { get, withAsOf } from './api'
import type { Meta } from './types'

/** The as-of time lives in the URL so any view (and any replay step) can be linked and reloaded. */
export function useAsOf(): [string | null, (at: string | null) => void] {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const asOf = params.get('as_of')
  const set = useCallback(
    (at: string | null) => {
      const next = new URLSearchParams(params.toString())
      if (at) next.set('as_of', at)
      else next.delete('as_of')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [params, router, pathname],
  )
  return [asOf, set]
}

export function useMeta() {
  const [asOf] = useAsOf()
  return useQuery({ queryKey: ['meta', asOf], queryFn: () => get<Meta>(withAsOf('/meta', asOf)) })
}

/** Builds an href that keeps the current as-of time. */
export function useHref() {
  const [asOf] = useAsOf()
  return useCallback(
    (path: string) => (asOf ? `${path}${path.includes('?') ? '&' : '?'}as_of=${encodeURIComponent(asOf)}` : path),
    [asOf],
  )
}
