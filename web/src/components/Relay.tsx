'use client'

import { clock, resident, STAGES, staffName, type Lane, type Stage } from '@thread/engine'
import Link from 'next/link'

const NODE: Record<Stage['state'], string> = {
  done: 'bg-ink border-ink',
  stuck: 'bg-poor border-poor',
  missed: 'bg-surface border-mid border-dashed',
  later: 'bg-surface border-line-strong',
}
const LINE: Record<Stage['state'], string> = {
  done: 'border-ink',
  stuck: 'border-ink',
  missed: 'border-mid border-dashed',
  later: 'border-line-strong border-dotted',
}
const TEXT: Record<Stage['state'], string> = { done: 'text-ink-2', stuck: 'font-semibold text-poor', missed: 'text-mid', later: 'text-ink-3' }

/** One concern as a relay: five stages from the person who noticed to a recorded outcome, and where the baton is held. */
export function RelayRow({ lane, fresh }: { lane: Lane; fresh?: boolean }) {
  const r = resident(lane.residentId)
  return (
    <li data-demo={`lane-${r.id}`} className={`grid grid-cols-[180px_repeat(5,minmax(118px,1fr))] border-t border-line ${fresh ? 'flash' : ''} ${lane.closed ? 'bg-sunken/50' : ''}`}>
      <Link href={`/size/?r=${r.id}`} className="block px-3 py-3 hover:bg-sunken">
        <b className="block text-[14px]">{r.name}</b>
        <span className="font-mono text-[11.5px] text-ink-3">
          {r.room} · {r.age}
        </span>
        {lane.stuck && <span className="mt-1 block text-[12px] font-semibold text-poor">Held at: {STAGES.find((s) => s.key === lane.stuck!.stage)!.label.toLowerCase()}</span>}
        {lane.closed && <span className="mt-1 block text-[12px] font-semibold text-good">Closed</span>}
      </Link>
      {lane.stages.map((s, i) => {
        const next = lane.stages[i + 1]
        return (
          <div key={s.key} className="relative px-2 pt-3 pb-3">
            {next && <span aria-hidden="true" className={`absolute top-[17px] right-0 left-[18px] border-t-2 ${s.state === 'done' ? LINE[next.state] : LINE.later}`} />}
            <span aria-hidden="true" className={`relative block size-[11px] rounded-full border-2 ${NODE[s.state]} ${s.state === 'stuck' ? 'ring-4 ring-poor/15' : ''}`} />
            <span className="sr-only">{STAGES[i]!.label}: </span>
            <span className={`mt-1.5 block pr-2 text-[12.5px] leading-snug ${TEXT[s.state]}`}>{s.text}</span>
            {s.at !== null && s.state !== 'stuck' && (
              <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
                {clock(s.at)}
                {s.by && s.key !== 'seen' && s.key !== 'handover' ? ` ${staffName(s.by)}` : ''}
              </span>
            )}
          </div>
        )
      })}
    </li>
  )
}

export function RelayHeader() {
  return (
    <div className="grid grid-cols-[180px_repeat(5,minmax(118px,1fr))] text-[12px] font-medium text-ink-3" aria-hidden="true">
      <span className="px-3 py-2">Resident</span>
      {STAGES.map((s, i) => (
        <span key={s.key} className="px-2 py-2">
          <span className="font-mono">{i + 1}</span> {s.label}
        </span>
      ))}
    </div>
  )
}
