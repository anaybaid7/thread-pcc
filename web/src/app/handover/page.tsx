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
const COLS = 'lg:grid-cols-[200px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.8fr)_150px]'

function Row({ item, open }: { item: HandoverItem; open: boolean }) {
  const { send, busy } = useWard()
  const r = resident(item.residentId)
  const list = (xs: string[], empty: string, cls = '') =>
    xs.length ? (
      <ul className={`space-y-0.5 ${cls}`}>
        {xs.map((x) => (
          <li key={x} className={/overdue|Not yet seen|No outcome|Measure/.test(x) ? 'font-semibold text-poor' : ''}>
            {x}
          </li>
        ))}
      </ul>
    ) : (
      <span className="text-ink-3">{empty}</span>
    )
  return (
    <li data-demo={`ho-${r.id}`} className={`grid gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-[13px] ${COLS} ${item.ack ? 'bg-good-soft/40' : ''}`}>
      <div>
        <b className="block text-[14px]">{r.name}</b>
        <span className="font-mono text-[11.5px] text-ink-3">{r.room}</span>
        <span className="mt-1 block">
          <StatusPill status={item.status} overdue={item.pending.some((p) => p.startsWith('Recheck overdue'))} />
        </span>
      </div>
      <div>
        <p className="label lg:hidden">Situation</p>
        <p className="font-medium text-ink">{item.headline.charAt(0).toUpperCase() + item.headline.slice(1)}</p>
        <div className="mt-1 text-ink-2">{list(item.done, '')}</div>
      </div>
      <div>
        <p className="label lg:hidden">Still open</p>
        {list(item.pending, 'Nothing')}
      </div>
      <div>
        <p className="label lg:hidden">Not known</p>
        {list(item.unknown, 'Nothing flagged', 'text-unknown')}
      </div>
      <div className="lg:text-right">
        {item.ack ? (
          <span className="font-mono text-[12.5px] text-good">
            ✓ {staffName(item.ack.by)} {clock(item.ack.at)}
          </span>
        ) : (
          <button type="button" data-demo="take" className="btn btn-primary" disabled={!open || busy} onClick={() => void send({ type: 'ack', by: ME, key: item.key })}>
            Take it on
          </button>
        )}
      </div>
    </li>
  )
}

export default function Handover() {
  const { ward, send, busy } = useWard()
  const h = handover(ward!)
  const acked = h.items.filter((i) => i.ack).length
  const all = h.items.length > 0 && acked === h.items.length
  const steps = [
    { label: `Move to ${clock(h.at)}`, done: h.open },
    { label: 'Read what’s flagged', done: h.open && acked > 0 },
    { label: 'Take on every item', done: h.open && all },
  ]
  return (
    <div className="space-y-5">
      <Guide who="Workflow 3 · Daniel, evening charge nurse" title="Carry it forward" steps={steps} />
      <section aria-labelledby="sheet" className="card">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3">
          <div>
            <p className="label">Handover sheet</p>
            <h2 id="sheet" className="text-[17px]">
              {h.from === 'day' ? 'Day to evening' : h.from === 'evening' ? 'Evening to night' : 'Night to day'} · <span className="font-mono">{h.label}</span>
            </h2>
          </div>
          <div className="min-w-[200px] flex-1">
            <div className="h-1 bg-sunken" aria-hidden="true">
              <div className="h-full bg-good transition-[width] duration-500" style={{ width: `${h.items.length ? (acked / h.items.length) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">
              {acked} of {h.items.length} taken on{all ? ' · nothing left unowned' : ''}
            </p>
          </div>
          {!h.open && (
            <button type="button" data-demo="advance" className="btn btn-primary" disabled={busy} onClick={() => void send({ type: 'advance', to: h.at })}>
              Move the clock to {clock(h.at)}
            </button>
          )}
        </div>
        {!h.open && (
          <p className="border-b border-line bg-sunken/60 px-4 py-2 text-[13px] text-ink-2">
            It is {when(ward!.now)}. Items can be taken on from {clock(h.at - 30)}. This is what will be handed over if nothing changes.
          </p>
        )}
        <div className={`hidden gap-x-4 px-4 py-2 text-[12px] font-medium text-ink-3 lg:grid ${COLS}`} aria-hidden="true">
          <span>Resident</span>
          <span>Situation and what was done</span>
          <span>Still open</span>
          <span>Not known</span>
          <span className="text-right">Taken on by</span>
        </div>
        {GROUPS.map((g) => {
          const items = h.items.filter((i) => i.group === g.key)
          if (!items.length) return null
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`}>
              <h3 id={`g-${g.key}`} className={`border-t border-line px-4 py-1.5 text-[12.5px] ${g.key === 'action' ? 'bg-poor-soft text-poor' : 'bg-sunken text-ink-2'}`}>
                {g.title} <span className="font-normal text-ink-3">· {g.note}</span>
              </h3>
              <ul>
                {items.map((i) => (
                  <Row key={i.key} item={i} open={h.open} />
                ))}
              </ul>
            </section>
          )
        })}
        {all && (
          <p className="enter border-t border-line px-4 py-3 text-[13.5px] font-semibold text-good">
            Signed for: every open item has an owner on the {h.from === 'day' ? 'evening' : h.from === 'evening' ? 'night' : 'day'} shift.
          </p>
        )}
      </section>
    </div>
  )
}
