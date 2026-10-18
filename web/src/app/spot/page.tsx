'use client'

import { AREAS, board, clock, deriveConcerns, resident, RESIDENTS, staffName, type Area } from '@thread/engine'
import Link from 'next/link'
import { useState } from 'react'
import { AreaIcon, Guide, StatusPill } from '@/components/ui'
import { useWard } from '@/lib/ward'

const ME = 'maya'
type Status = 'usual' | 'different' | 'unchecked'

/** What the nurse sees while Maya works: the same board, updating as soon as she sends. */
function LiveBoard({ fresh }: { fresh: string | null }) {
  const { ward } = useWard()
  const items = board(ward!).filter((b) => b.tone !== 'done')
  return (
    <section aria-labelledby="live" className="card">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
        <h2 id="live" className="text-[15px]">
          Priya’s board
        </h2>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <span className="inline-block size-1.5 rounded-full bg-good" /> live
        </span>
      </div>
      <ul>
        {items.map((b) => {
          const r = resident(b.residentId)
          return (
            <li key={b.key} data-demo={`live-${r.id}`} className={`grid grid-cols-[1fr_auto] gap-x-3 border-t border-line px-4 py-2.5 first:border-t-0 ${b.residentId === fresh ? 'flash' : ''}`}>
              <span>
                <b className="text-[14px]">{r.name}</b> <span className="font-mono text-[11.5px] text-ink-3">{r.room}</span>
                <span className="block text-[12.5px] text-ink-3">{b.detail}</span>
              </span>
              <span className={`text-right text-[12.5px] font-semibold ${b.tone === 'urgent' ? 'text-poor' : 'text-ink-2'}`}>{b.reason}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

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
      <Guide who="Workflow 1 · Maya, day PSW, on her phone" title="Spot it" steps={steps} />
      <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[22px] border-[6px] border-ink bg-surface">
          <div className="flex items-center justify-between bg-ink px-4 pt-1 pb-2 font-mono text-[11px] text-white/80">
            <span>{clock(ward!.now)}</span>
            <span>THREAD · Maya</span>
          </div>
          {!r ? (
            <div>
              <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold">Your residents</p>
              <ul>
                {mine.map((x) => {
                  const c = open(x.id)
                  const last = lastCheck(x.id)
                  return (
                    <li key={x.id} className="border-b border-line last:border-b-0">
                      <button type="button" data-demo={`resident-${x.id}`} onClick={() => pick(x.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken">
                        <span className="min-w-0 flex-1">
                          <b className="block text-[15px]">{x.name}</b>
                          <span className="text-[12.5px] text-ink-3">
                            Room {x.room} · {last ? `checked ${clock(last.at)}` : 'not checked today'}
                          </span>
                        </span>
                        {c && <StatusPill status={c.status} overdue={c.overdue} />}
                        <span aria-hidden="true" className="text-ink-3">
                          ›
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : sent ? (
            <div className="enter space-y-3 px-4 py-5">
              <p className="text-[17px] font-semibold">{sent.reported ? `Sent to Priya at ${clock(sent.at)}.` : `Check-in saved at ${clock(sent.at)}.`}</p>
              <p className="text-[14px] text-ink-2">
                {sent.reported
                  ? `It is on her board now. ${unchecked.length ? `Sent as not known: ${unchecked.map((a) => AREAS[a].label.toLowerCase()).join(', ')}.` : ''}`
                  : 'Everything you checked was usual. No report needed.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {sent.reported && (
                  <Link href="/size/" className="btn btn-primary">
                    Continue as the nurse
                  </Link>
                )}
                <button type="button" className="btn" onClick={() => setRid(null)}>
                  Back to residents
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <button type="button" className="px-1 text-[18px] leading-none text-ink-3 hover:text-ink" onClick={() => setRid(null)} aria-label="Back to residents">
                  ‹
                </button>
                <span className="min-w-0 flex-1">
                  <b className="block text-[15px]">{r.name}</b>
                  <span className="text-[12px] text-ink-3">
                    Room {r.room} · compared with {r.pronoun === 'she' ? 'her' : 'his'} usual
                  </span>
                </span>
              </div>
              <ul>
                {areas.map((a) => {
                  const m = marks[a]
                  const status = m?.status ?? 'unchecked'
                  return (
                    <li key={a} className={`border-b border-line px-4 py-3 ${status === 'different' ? 'bg-poor-soft/50' : ''}`}>
                      <div className="flex items-start gap-2.5">
                        <AreaIcon area={a} />
                        <div className="min-w-0">
                          <b className="block text-[14px]">{AREAS[a].label}</b>
                          <span className="text-[12.5px] text-ink-3">Usually: {r.usual[a]}</span>
                        </div>
                      </div>
                      <fieldset className="seg mt-2 w-full">
                        <legend className="sr-only">{AREAS[a].label}</legend>
                        {(['usual', 'different', 'unchecked'] as Status[]).map((s) => (
                          <button
                            key={s}
                            type="button"
                            data-demo={`mark-${a}-${s}`}
                            aria-pressed={status === s}
                            onClick={() => mark(a, s)}
                            className={`flex-1 ${status === s && s === 'different' ? 'bg-poor! text-white!' : status === s && s === 'usual' ? 'bg-good! text-white!' : status === s ? 'bg-sunken! text-ink-2!' : ''}`}
                          >
                            {s === 'usual' ? 'Usual' : s === 'different' ? 'Different' : 'Not checked'}
                          </button>
                        ))}
                      </fieldset>
                      {m?.status === 'different' && (
                        <div className="enter mt-2 flex flex-wrap gap-1.5">
                          {AREAS[a].options.map((o, i) => (
                            <button
                              key={o}
                              type="button"
                              data-demo={`finding-${a}-${i}`}
                              aria-pressed={m.finding === o}
                              onClick={() => setMarks((x) => ({ ...x, [a]: { status: 'different', finding: o } }))}
                              className={`rounded-sm border px-2 py-1 text-[13px] ${m.finding === o ? 'border-ink bg-ink text-white' : 'border-line-strong bg-surface hover:bg-sunken'}`}
                            >
                              {o}
                            </button>
                          ))}
                          <input
                            className="field py-1 text-[13px]"
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
                <label className="block border-b border-line px-4 py-3 text-[13px]">
                  <span className="font-semibold">In {r.pronoun === 'she' ? 'her' : 'his'} words</span> <span className="text-ink-3">(optional)</span>
                  <input data-demo="quote" className="field mt-1" value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={200} placeholder="What they said" />
                </label>
              )}
              <div className="space-y-2 px-4 py-3">
                <p className="text-[12.5px] text-ink-3">
                  {different.length} different · {unchecked.length} not checked{unchecked.length ? ', sent as not known' : ''}
                </p>
                <button type="button" data-demo="send" className="btn btn-primary w-full py-2.5 text-[15px]" disabled={!ready || busy} onClick={() => void submit()}>
                  {different.length ? `Send to ${staffName('priya')}` : 'Save check-in'}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-3 lg:sticky lg:top-4">
          <LiveBoard fresh={sent?.reported ? (rid ?? null) : null} />
          <p className="text-[12.5px] text-ink-3">
            Nothing Maya leaves unchecked is assumed fine. It reaches the nurse as <span className="font-semibold text-unknown">not known</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
