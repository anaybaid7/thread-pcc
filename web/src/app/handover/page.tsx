'use client'

import { clock, handover, resident, staffName, when, type HandoverItem } from '@thread/engine'
import { Guide, StatusPill } from '@/components/ui'
import { useWard } from '@/lib/ward'

const ME = 'daniel'
const GROUPS: { key: HandoverItem['group']; title: string; note: string }[] = [
  { key: 'action', title: 'Needs action', note: 'Overdue, unseen, or no outcome recorded' },
  { key: 'open', title: 'Open, on plan', note: 'Recheck still to come' },
  { key: 'closed', title: 'Closed this shift', note: 'Back to usual, with a recorded outcome' },
]

function Item({ item, open }: { item: HandoverItem; open: boolean }) {
  const { send, busy } = useWard()
  const r = resident(item.residentId)
  return (
    <li className={`card overflow-hidden border-l-4 ${item.ack ? 'border-l-good' : item.group === 'action' ? 'border-l-poor' : item.group === 'open' ? 'border-l-accent' : 'border-l-line-strong'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <b className="text-[15px]">{r.name}</b>
            <span className="font-mono text-[12px] text-ink-3">{r.room}</span>
            <StatusPill status={item.status} overdue={item.pending.some((p) => p.startsWith('Recheck overdue'))} />
          </p>
          <p className="mt-0.5 text-[14px] text-ink-2">{item.headline}</p>
        </div>
        {item.ack ? (
          <span className="text-[12.5px] font-semibold text-good">
            Taken on by {staffName(item.ack.by)} · {clock(item.ack.at)}
          </span>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!open || busy} onClick={() => void send({ type: 'ack', by: ME, key: item.key })}>
            Take it on
          </button>
        )}
      </div>
      <div className="grid gap-3 px-4 pt-2 pb-3 text-[13px] sm:grid-cols-3">
        <div>
          <p className="eyebrow">Done</p>
          <ul className="mt-1 space-y-0.5 text-ink-2">
            {item.done.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Still open</p>
          <ul className="mt-1 space-y-0.5">
            {item.pending.length ? item.pending.map((p) => <li key={p} className={/overdue|Not yet seen|No outcome|Measure/.test(p) ? 'font-semibold text-poor' : ''}>{p}</li>) : <li className="text-ink-3">Nothing</li>}
          </ul>
        </div>
        <div>
          <p className="eyebrow">Not known</p>
          <ul className="mt-1 space-y-0.5 text-unknown">{item.unknown.length ? item.unknown.map((u) => <li key={u}>{u}</li>) : <li className="text-ink-3">Nothing flagged</li>}</ul>
        </div>
      </div>
    </li>
  )
}

export default function Handover() {
  const { ward, send, busy } = useWard()
  const h = handover(ward!)
  const acked = h.items.filter((i) => i.ack).length
  const steps = [
    { label: `Move to ${clock(h.at)}`, done: h.open },
    { label: 'Read what’s flagged', done: h.open && acked > 0 },
    { label: 'Take on every item', done: h.open && h.items.length > 0 && acked === h.items.length },
  ]
  return (
    <div className="space-y-5">
      <Guide who="Workflow 3 · Daniel, evening charge nurse" title="Carry it forward" steps={steps} />
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <div>
          <p className="eyebrow">Handover</p>
          <p className="text-[18px] font-semibold">
            {h.from === 'day' ? 'Day to evening' : h.from === 'evening' ? 'Evening to night' : 'Night to day'} · {h.label}
          </p>
        </div>
        <div className="flex-1">
          <div className="h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
            <div className="h-full bg-good transition-[width] duration-500" style={{ width: `${h.items.length ? (acked / h.items.length) * 100 : 0}%` }} />
          </div>
          <p className="mt-1 text-[12.5px] text-ink-3">
            {acked} of {h.items.length} taken on{acked === h.items.length && h.items.length ? ' · nothing left unowned' : ''}
          </p>
        </div>
        {!h.open && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send({ type: 'advance', to: h.at })}>
            Move the clock to {clock(h.at)}
          </button>
        )}
      </div>
      {!h.open && <p className="text-[13.5px] text-ink-3">It is {when(ward!.now)}. Items can be taken on from {clock(h.at - 30)}. This is what will be handed over if nothing changes.</p>}
      {GROUPS.map((g) => {
        const items = h.items.filter((i) => i.group === g.key)
        if (!items.length) return null
        return (
          <section key={g.key} aria-labelledby={`g-${g.key}`}>
            <div className="mb-2 flex items-baseline gap-3">
              <h2 id={`g-${g.key}`} className="text-[18px]">
                {g.title}
              </h2>
              <span className="text-[12.5px] text-ink-3">{g.note}</span>
            </div>
            <ul className="space-y-3">
              {items.map((i) => (
                <Item key={i.key} item={i} open={h.open} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
