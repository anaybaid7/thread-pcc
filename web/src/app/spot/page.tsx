'use client'

import { AREAS, clock, deriveConcerns, RESIDENTS, staffName, type Area } from '@thread/engine'
import Link from 'next/link'
import { useState } from 'react'
import { AreaIcon, Guide, Panel, StatusPill } from '@/components/ui'
import { useWard } from '@/lib/ward'

const ME = 'maya'
type Status = 'usual' | 'different' | 'unchecked'

export default function Spot() {
  const { ward, send, busy } = useWard()
  const mine = RESIDENTS.filter((r) => r.assignedTo === ME)
  const [rid, setRid] = useState<string | null>(null)
  const [marks, setMarks] = useState<Partial<Record<Area, { status: Status; finding?: string }>>>({})
  const [quote, setQuote] = useState('')
  const [sent, setSent] = useState<{ at: number; reported: boolean } | null>(null)
  const concerns = deriveConcerns(ward!)
  const open = (id: string) => concerns.find((c) => c.residentId === id && c.status !== 'resolved')
  const lastCheck = (id: string) => ward!.events.filter((e) => e.type === 'observe' && e.residentId === id).pop()
  const r = mine.find((x) => x.id === rid)
  const areas = r ? (Object.keys(r.usual) as Area[]) : []
  const different = areas.filter((a) => marks[a]?.status === 'different')
  const unchecked = areas.filter((a) => !marks[a] || marks[a]!.status === 'unchecked')
  const ready = different.every((a) => marks[a]?.finding?.trim()) && areas.some((a) => marks[a] && marks[a]!.status !== 'unchecked')

  const evelyn = open('evelyn')
  const steps = [
    { label: 'Open Evelyn', done: rid === 'evelyn' || !!evelyn },
    { label: 'Mark what’s different', done: (rid === 'evelyn' && different.length > 0) || !!evelyn },
    { label: 'Send to the nurse', done: !!evelyn },
  ]

  const pick = (id: string) => {
    setRid(id)
    setMarks({})
    setQuote('')
    setSent(null)
  }
  const mark = (a: Area, status: Status) => setMarks((m) => ({ ...m, [a]: { status, finding: status === 'different' ? m[a]?.finding : undefined } }))

  const submit = async () => {
    if (!r) return
    const at = ward!.now
    const ok = await send({
      type: 'checkin',
      by: ME,
      residentId: r.id,
      findings: areas.map((a) => ({ area: a, status: marks[a]?.status ?? 'unchecked', finding: marks[a]?.finding })),
      quote: quote || undefined,
    })
    if (ok) setSent({ at, reported: different.length > 0 })
  }

  return (
    <div className="space-y-5">
      <Guide who="Workflow 1 · Maya, day PSW" title="Spot it" steps={steps} />
      <div className="grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Panel title="Your residents">
          <ul className="space-y-1.5">
            {mine.map((x) => {
              const c = open(x.id)
              const last = lastCheck(x.id)
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => pick(x.id)}
                    aria-pressed={rid === x.id}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${rid === x.id ? 'border-ink bg-sunken/60' : 'border-line hover:border-line-strong'}`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-serif text-[14px] font-semibold text-accent-strong">
                      {x.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[14.5px]">{x.name}</b>
                      <span className="text-[12px] text-ink-3">
                        Room {x.room} · {last ? `checked ${clock(last.at)}` : 'not checked today'}
                      </span>
                      {c && (
                        <span className="mt-1 block">
                          <StatusPill status={c.status} overdue={c.overdue} />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        {!r ? (
          <Panel title="Check-in">
            <p className="text-[14px] text-ink-3">Pick a resident. You’ll compare what you see with what is usual for them.</p>
          </Panel>
        ) : sent ? (
          <Panel title={`${r.name} · room ${r.room}`}>
            <div className="enter space-y-3">
              <p className="text-[16px] font-semibold">{sent.reported ? `Sent to Priya at ${clock(sent.at)}.` : `Check-in saved at ${clock(sent.at)}.`}</p>
              <p className="text-[14px] text-ink-2">
                {sent.reported
                  ? `It is on her board now as “Not yet seen by a nurse”. ${unchecked.length ? `Listed as not known: ${unchecked.map((a) => AREAS[a].label.toLowerCase()).join(', ')}.` : ''}`
                  : 'Everything you checked was usual. No report needed.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {sent.reported && (
                  <Link href="/size/" className="btn btn-primary">
                    Continue as the nurse
                  </Link>
                )}
                <button type="button" className="btn" onClick={() => pick(r.id)}>
                  New check-in
                </button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title={`${r.name} · room ${r.room}`} aside={<span className="text-[12.5px] text-ink-3">Compared with {r.pronoun === 'she' ? 'her' : 'his'} usual</span>}>
            <ul className="divide-y divide-line">
              {areas.map((a) => {
                const m = marks[a]
                return (
                  <li key={a} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="flex items-start gap-3">
                      <AreaIcon area={a} />
                      <div>
                        <b className="block text-[14px]">{AREAS[a].label}</b>
                        <span className="text-[13px] text-ink-3">Usually: {r.usual[a]}</span>
                      </div>
                    </div>
                    <fieldset className="flex rounded-lg border border-line-strong p-0.5 text-[13px] font-medium">
                      <legend className="sr-only">{AREAS[a].label}</legend>
                      {(['usual', 'different', 'unchecked'] as Status[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={(m?.status ?? 'unchecked') === s}
                          onClick={() => mark(a, s)}
                          className={`rounded-md px-3 py-1 ${(m?.status ?? 'unchecked') === s ? (s === 'different' ? 'bg-poor text-white' : s === 'usual' ? 'bg-good text-white' : 'bg-sunken text-ink') : 'text-ink-3 hover:text-ink'}`}
                        >
                          {s === 'usual' ? 'Usual' : s === 'different' ? 'Different' : 'Not checked'}
                        </button>
                      ))}
                    </fieldset>
                    {m?.status === 'different' && (
                      <div className="enter flex flex-wrap gap-1.5 sm:col-span-2 sm:pl-8">
                        {AREAS[a].options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            aria-pressed={m.finding === o}
                            onClick={() => setMarks((x) => ({ ...x, [a]: { status: 'different', finding: o } }))}
                            className={`rounded-full border px-3 py-1 text-[13px] ${m.finding === o ? 'border-ink bg-ink text-white' : 'border-line-strong hover:bg-sunken'}`}
                          >
                            {o}
                          </button>
                        ))}
                        <input
                          className="field w-auto min-w-[200px] flex-1 py-1 text-[13px]"
                          placeholder="Or describe it"
                          aria-label={`${AREAS[a].label}: what was different`}
                          value={m.finding && !AREAS[a].options.includes(m.finding) ? m.finding : ''}
                          onChange={(e) => setMarks((x) => ({ ...x, [a]: { status: 'different', finding: e.target.value } }))}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {different.length > 0 && (
              <label className="mt-2 block text-[13px]">
                <span className="font-semibold">In {r.pronoun === 'she' ? 'her' : 'his'} words</span> <span className="text-ink-3">(optional)</span>
                <input className="field mt-1" value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={200} placeholder="What they said" />
              </label>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void submit()}>
                {different.length ? `Send to ${staffName('priya')}` : 'Save check-in'}
              </button>
              <span className="text-[13px] text-ink-3">
                {different.length} different · {unchecked.length} not checked{unchecked.length ? ' (sent as not known)' : ''}
              </span>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
