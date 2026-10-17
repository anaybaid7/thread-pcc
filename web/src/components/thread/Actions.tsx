'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { post, STATIC } from '@/lib/api'
import type { Domain, ThreadDetail } from '@/lib/types'

const STAFF = [
  ['RPN Daniel O.', 'RPN'],
  ['RN Priya S.', 'RN'],
  ['PSW Amara K.', 'PSW'],
  ['PSW Joel T.', 'PSW'],
] as const

export function Actions({ threadId, domain, name, disabled }: { threadId: string; domain: Domain; name: string; disabled: boolean }) {
  const qc = useQueryClient()
  const [actor, setActor] = useState(0)
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: (kind: 'verify_current_status' | 'mark_reviewed') =>
      post<ThreadDetail>(`/threads/${encodeURIComponent(threadId)}/actions`, {
        action_type: kind,
        actor: (STAFF[actor] ?? STAFF[0])[0],
        actor_role: (STAFF[actor] ?? STAFF[0])[1],
        note,
        value: kind === 'verify_current_status' && value !== '' ? Number(value) : null,
      }),
    onSuccess: (d, kind) => {
      setDone(
        kind === 'mark_reviewed'
          ? 'Marked reviewed. The concern stays open: reviewing is not resolving.'
          : value !== ''
            ? `Bedside check recorded. Thread is now: ${d.summary.state_label}.`
            : 'Verification noted. Add a measurement to let the thread change state.',
      )
      setValue('')
      setNote('')
      qc.invalidateQueries()
    },
  })
  const off = disabled || STATIC || m.isPending
  const mobility = domain === 'mobility'

  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      <label className="block">
        <span className="label">Who is acting</span>
        <select className="input mt-1" value={actor} onChange={(e) => setActor(Number(e.target.value))} disabled={off}>
          {STAFF.map(([n], i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">{mobility ? `${name}'s assist level now` : `What ${name} took at the bedside (mL)`}</span>
        {mobility ? (
          <select className="input mt-1" value={value} onChange={(e) => setValue(e.target.value)} disabled={off}>
            <option value="">Not checked</option>
            <option value="0">Independent</option>
            <option value="1">1-person assist</option>
            <option value="2">2-person assist</option>
          </select>
        ) : (
          <input className="input mt-1" inputMode="numeric" type="number" min={0} max={2000} step={10} placeholder="e.g. 250" value={value} onChange={(e) => setValue(e.target.value)} disabled={off} />
        )}
      </label>
      <label className="block">
        <span className="label">Note (optional)</span>
        <textarea className="input mt-1 min-h-[64px]" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} disabled={off} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={off} onClick={() => m.mutate('verify_current_status')}>
          Verify current status
        </button>
        <button type="button" className="btn" disabled={off} onClick={() => m.mutate('mark_reviewed')}>
          Mark reviewed
        </button>
      </div>
      <p className="text-[13px] text-ink-3">
        A bedside value is added to the record and the thread is recomputed. “Mark reviewed” only records that you looked.
      </p>
      {STATIC && <p className="text-[13.5px] text-ink-2">Actions are off in the static preview.</p>}
      {disabled && !STATIC && <p className="text-[13.5px] text-ink-2">Return to now to record an action.</p>}
      <div aria-live="polite">
        {done && <p className="font-bold" style={{ color: 'var(--color-verified)' }}>{done}</p>}
        {m.isError && <p className="font-bold" style={{ color: 'var(--color-persistent)' }}>{(m.error as Error).message}</p>}
      </div>
    </form>
  )
}
