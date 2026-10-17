'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { get, post, STATIC } from '@/lib/api'
import { STATE_META, when } from '@/lib/format'
import type { State, Story, ThreadDetail } from '@/lib/types'
import { ErrorBox, Skeleton, StateChip } from '../ui'
import { StoryChart } from './StoryChart'

const ROLE_WORD: Record<string, string> = {
  response: 'Response',
  plan: 'Plan only',
  recurrence: 'Signal again',
  signal: 'Signal',
  outcome: 'Verified',
  contradiction: 'Contradicts',
  context: 'Context',
}

export function StoryPanel({
  rid,
  steps,
  cells,
  cursor,
  onClose,
}: {
  rid: string
  steps: string[]
  cells: (State | null)[]
  cursor: number
  onClose: () => void
}) {
  const q = useQuery({ queryKey: ['story', rid], queryFn: () => get<Story>(`/story/${rid}`) })
  const [picked, setPicked] = useState<string | null>(null)
  const s = q.data
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  if (!s)
    return (
      <div className="panel p-5">
        <Skeleton lines={6} />
      </div>
    )

  const r = s.resident
  const name = r.preferred_name ?? r.display_name.split(' ')[0]
  const at = cells[cursor] ?? null
  const marker = s.markers.find((m) => m.id === picked) ?? null

  return (
    <section className="panel p-4 sm:p-5" aria-label={`${r.display_name} at a glance`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[24px]">
            {r.display_name}
            {r.preferred_name && r.preferred_name !== r.display_name.split(' ')[0] && <span className="text-ink-3"> “{r.preferred_name}”</span>}
          </h2>
          <p className="text-[14px] text-ink-2">
            Room {r.room} · {r.wing} wing · {r.age} · {s.domain_label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {at ? <StateChip state={at} /> : <span className="chip text-ink-3">No concern</span>}
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </header>

      <div className="mt-3">
        <StoryChart story={s} steps={steps} cells={cells} cursor={cursor} selected={picked} onSelect={setPicked} />
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2" aria-hidden="true">
        <span>● measurement (red below target, green meets)</span>
        <span>■ response</span>
        <span>◌ plan only</span>
        <span>◉ signal again</span>
        <span>· context</span>
        <span>hatched: nothing measured</span>
      </div>

      {s.markers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Notes in this thread">
          {s.markers.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={picked === m.id}
              onClick={() => setPicked(picked === m.id ? null : m.id)}
              className={`rounded border-[1.5px] px-1.5 text-[12.5px] ${picked === m.id ? 'border-ink bg-sticky font-bold' : 'border-line-soft hover:border-ink'}`}
            >
              {m.time.slice(11, 16)} {ROLE_WORD[m.role] ?? m.step}
            </button>
          ))}
        </div>
      )}

      {marker ? (
        <div className="mt-3 rounded-md border-2 border-ink bg-paper p-3">
          <p className="text-[13px] text-ink-3">
            {marker.label} · {when(marker.time)} · {marker.author}
            {marker.late && <b style={{ color: 'var(--color-persistent)' }}> · entered late, {when(marker.recorded_at)}</b>}
          </p>
          {marker.note_text && (
            <p className="note-paper mt-1">
              {marker.quote && marker.note_text.includes(marker.quote) ? (
                <>
                  {marker.note_text.slice(0, marker.note_text.indexOf(marker.quote))}
                  <mark className="mark-span">{marker.quote}</mark>
                  {marker.note_text.slice(marker.note_text.indexOf(marker.quote) + marker.quote.length)}
                </>
              ) : (
                marker.note_text
              )}
            </p>
          )}
          <p className="mt-1.5">
            <b>{ROLE_WORD[marker.role] ?? marker.step}.</b> {marker.note}
          </p>
        </div>
      ) : (
        s.markers.length > 0 && <p className="mt-2 text-[13.5px] text-ink-3">Tap a note to read what was written.</p>
      )}

      {s.thread ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <div>
            <p className="label">What’s going on</p>
            <ul className="mt-1 space-y-1.5">
              {s.sentences.slice(0, 3).map((x) => (
                <li key={x.text} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{x.text}</span>
                </li>
              ))}
            </ul>
            <Link href={`/thread?id=${encodeURIComponent(s.thread.thread_id)}`} className="mt-3 inline-block text-[14px] font-bold underline underline-offset-4">
              Full evidence thread →
            </Link>
          </div>
          <div className="space-y-3">
            {s.next_step && (
              <div className="sticky-note" style={{ transform: 'rotate(-0.6deg)' }}>
                <p className="label" style={{ color: 'var(--color-ink-2)' }}>
                  Next step
                </p>
                <p className="mt-0.5 font-bold">{s.next_step}</p>
              </div>
            )}
            <CheckNow story={s} name={name ?? ''} />
          </div>
        </div>
      ) : (
        <p className="mt-4 text-ink-2">No concern thread for {name}. Every measurement met the care plan, and no note described a problem.</p>
      )}
    </section>
  )
}

/** Record a bedside check. Live: saved and the thread is recomputed. Static preview: the same rule, shown locally. */
function CheckNow({ story, name }: { story: Story; name: string }) {
  const qc = useQueryClient()
  const mobility = story.domain === 'mobility'
  const [value, setValue] = useState('')
  const [result, setResult] = useState<{ state: State; text: string } | null>(null)
  const target = story.rule?.threshold ?? 0
  const m = useMutation({
    mutationFn: (v: number) =>
      post<ThreadDetail>(`/threads/${encodeURIComponent(story.thread!.thread_id)}/actions`, {
        action_type: 'verify_current_status',
        actor: 'RPN Daniel O.',
        actor_role: 'RPN',
        value: v,
      }),
    onSuccess: (d) => {
      setResult({ state: d.thread.state, text: d.thread.review_reason })
      qc.invalidateQueries()
    },
  })

  const submit = () => {
    const v = Number(value)
    if (value === '' || Number.isNaN(v)) return
    if (!STATIC) return m.mutate(v)
    const meets = story.rule?.baseline_documented ? (mobility ? v <= target : v >= target) : false
    setResult(
      meets
        ? { state: 'outcome_verified', text: `Checked at the bedside and meets the care plan. The thread would close.` }
        : { state: 'persistent_signal', text: `Still ${mobility ? 'above the usual assist level' : `below the ${target} mL target`}. The thread stays open as persistent.` },
    )
  }

  return (
    <form
      className="rounded-md border-2 border-dashed border-ink p-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="block">
        <span className="font-bold">Check {name} now</span>
        <span className="block text-[13px] text-ink-2">{mobility ? 'How much help did they need?' : 'How much did they drink at the bedside (mL)?'}</span>
        <span className="mt-2 flex gap-2">
          {mobility ? (
            <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
              <option value="">Choose…</option>
              <option value="0">Independent</option>
              <option value="1">1-person assist</option>
              <option value="2">2-person assist</option>
            </select>
          ) : (
            <input className="input" type="number" inputMode="numeric" min={0} max={2000} step={10} placeholder={`e.g. ${target}`} value={value} onChange={(e) => setValue(e.target.value)} />
          )}
          <button className="btn btn-primary shrink-0" disabled={value === '' || m.isPending}>
            Record
          </button>
        </span>
      </label>
      <div aria-live="polite">
        {result && (
          <p className="mt-2 text-[14px]">
            <b style={{ color: STATE_META[result.state].color }}>{STATE_META[result.state].label}.</b> {result.text}
            {STATIC && <span className="block text-[12.5px] text-ink-3">Preview: in the running app this is saved and the whole thread is recomputed.</span>}
          </p>
        )}
        {m.isError && <p className="mt-2 text-[14px]" style={{ color: 'var(--color-persistent)' }}>{(m.error as Error).message}</p>}
      </div>
    </form>
  )
}
