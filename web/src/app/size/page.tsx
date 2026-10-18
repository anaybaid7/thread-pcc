'use client'

import { AREAS, board, clock, compare, deriveConcerns, MEASURES, offerFlags, resident, staffName, when, type Area, type Concern, type MeasureKind, type Sbar } from '@thread/engine'
import Link from 'next/link'
import { useState } from 'react'
import { AreaIcon, DayStrip, Guide, Panel, StatusPill } from '@/components/ui'
import { useWard, type SbarResult } from '@/lib/ward'

const ME = 'priya'
const TONE = { urgent: 'border-l-poor', attention: 'border-l-mid', routine: 'border-l-accent', done: 'border-l-good' }

function Checks({ concern }: { concern: Concern }) {
  const { ward, send, busy } = useWard()
  const r = resident(concern.residentId)
  const [kind, setKind] = useState<MeasureKind>(concern.unknown.includes('drinking') ? 'fluids' : 'temp')
  const [value, setValue] = useState('')
  const m = MEASURES[kind]
  const preview = value !== '' && (m.choices || Number.isFinite(Number(value))) ? compare(r, kind, m.choices ? value : Number(value), ward!.now) : null
  const record = async () => {
    const sent = value
    // Only clear what was saved: a value typed while saving is kept.
    if (await send({ type: 'measure', by: ME, residentId: r.id, kind, value: m.choices ? sent : Number(sent) })) setValue((v) => (v === sent ? '' : v))
  }
  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12.5px] font-semibold">
          Check
          <select className="field mt-1 w-[220px] py-1.5" value={kind} onChange={(e) => (setKind(e.target.value as MeasureKind), setValue(''))}>
            {(Object.keys(MEASURES) as MeasureKind[]).map((k) => (
              <option key={k} value={k}>
                {MEASURES[k].label}
              </option>
            ))}
          </select>
        </label>
        {m.choices ? (
          <fieldset className="flex rounded-lg border border-line-strong p-0.5 text-[13px]">
            <legend className="sr-only">{m.label}</legend>
            {m.choices.map((c) => (
              <button key={c} type="button" aria-pressed={value === c} onClick={() => setValue(c)} className={`rounded-md px-2.5 py-1 ${value === c ? 'bg-ink text-white' : 'text-ink-2'}`}>
                {c}
              </button>
            ))}
          </fieldset>
        ) : (
          <label className="text-[12.5px] font-semibold">
            Value {m.unit && <span className="font-normal text-ink-3">({m.unit})</span>}
            <input className="field mt-1 w-[120px] py-1.5 font-mono" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        )}
        <button type="button" className="btn btn-primary" disabled={!preview || busy} onClick={() => void record()}>
          Record
        </button>
      </div>
      {preview && (
        <p className={`mt-2 text-[13px] ${preview.inUsual ? 'text-good' : 'font-semibold text-poor'}`}>
          {preview.inUsual ? 'Within usual: ' : 'Outside usual: '}
          {preview.text}
        </p>
      )}
    </div>
  )
}

function Decide({ concern }: { concern: Concern }) {
  const { ward, send, sbar, busy, health } = useWard()
  const r = resident(concern.residentId)
  const areas = [...new Set([...concern.changed.map((c) => c.area), ...concern.unknown])] as Area[]
  const [mode, setMode] = useState<'watch' | 'escalate'>('watch')
  const [inMin, setIn] = useState(120)
  const [what, setWhat] = useState<Area[]>(areas)
  const [draft, setDraft] = useState<Sbar | null>(null)
  const [meta, setMeta] = useState<SbarResult | null>(null)
  const [drafting, setDrafting] = useState(false)
  const getDraft = async () => {
    setDrafting(true)
    try {
      const res = await sbar(concern.id)
      setMeta(res)
      setDraft(res.draft)
    } finally {
      setDrafting(false)
    }
  }
  const submit = () =>
    void send({ type: 'plan', by: ME, concernId: concern.id, decision: mode, recheckIn: inMin, recheck: what.length ? what : areas, ...(mode === 'escalate' ? { to: 'osei', sbar: draft ?? undefined } : {}) })

  return (
    <div className="space-y-3">
      <fieldset className="flex w-fit rounded-lg border border-line-strong p-0.5 text-[13.5px] font-medium">
        <legend className="sr-only">Decision</legend>
        {(['watch', 'escalate'] as const).map((d) => (
          <button key={d} type="button" aria-pressed={mode === d} onClick={() => setMode(d)} className={`rounded-md px-3 py-1 ${mode === d ? 'bg-ink text-white' : 'text-ink-2'}`}>
            {d === 'watch' ? 'Watch with a recheck' : `Escalate to ${staffName('osei')}`}
          </button>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-semibold">Recheck in</span>
        {[60, 120, 240].map((m) => (
          <button key={m} type="button" aria-pressed={inMin === m} onClick={() => setIn(m)} className={`rounded-full border px-3 py-1 ${inMin === m ? 'border-ink bg-ink text-white' : 'border-line-strong'}`}>
            {m / 60}h
          </button>
        ))}
        <span className="font-semibold">for</span>
        {areas.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={what.includes(a)}
            onClick={() => setWhat((w) => (w.includes(a) ? w.filter((x) => x !== a) : [...w, a]))}
            className={`rounded-full border px-3 py-1 ${what.includes(a) ? 'border-ink bg-sunken' : 'border-line text-ink-3'}`}
          >
            {AREAS[a].label.toLowerCase()}
          </button>
        ))}
      </div>
      {mode === 'escalate' && (
        <div className="space-y-2 rounded-lg border border-line p-3">
          {!draft ? (
            <button type="button" className="btn" onClick={() => void getDraft()} disabled={drafting}>
              {drafting ? (health?.gemini.configured ? 'Gemini is drafting from the record…' : 'Drafting…') : 'Draft the SBAR'}
            </button>
          ) : (
            <>
              <p className="text-[12.5px] text-ink-3">
                {meta?.source === 'gemini' ? `AI-assisted draft (${meta.model}), built only from the record. Check every line.` : `Template draft. ${meta?.fallbackReason ?? ''}`}
              </p>
              {(['situation', 'background', 'assessment', 'recommendation'] as const).map((k) => (
                <label key={k} className="block text-[12.5px] font-semibold capitalize">
                  {k}
                  <textarea
                    className="field mt-1 min-h-[52px] font-normal"
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value, source: 'edited' })}
                  />
                </label>
              ))}
            </>
          )}
        </div>
      )}
      <button type="button" className="btn btn-primary" disabled={busy || (mode === 'escalate' && !draft)} onClick={submit}>
        {mode === 'watch' ? `Watch ${r.preferred}, recheck at ${clock(ward!.now + inMin)}` : `Escalate to ${staffName('osei')}`}
      </button>
    </div>
  )
}

function ConcernPanel({ concern }: { concern: Concern }) {
  const { ward, send, busy } = useWard()
  const r = resident(concern.residentId)
  const plan = concern.plans[concern.plans.length - 1]
  const checked = concern.checks.map((k) => MEASURES[k.kind].area).filter((a): a is Area => !!a)
  const rows = [...new Set([...concern.changed.map((c) => c.area), ...concern.unknown, ...checked, ...concern.followups.map((f) => f.area)])] as Area[]
  return (
    <div className="space-y-4">
      <Panel
        title={
          <span className="flex flex-wrap items-center gap-2">
            {r.name} <span className="font-sans text-[13px] font-normal text-ink-3">room {r.room} · {r.age}</span>
          </span>
        }
        aside={<StatusPill status={concern.status} overdue={concern.overdue} />}
      >
        <DayStrip ward={ward!} residentId={r.id} />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13.5px]">
            <thead className="text-[11.5px] tracking-wide text-ink-3 uppercase">
              <tr>
                <th className="py-1.5 font-semibold">Area</th>
                <th className="py-1.5 font-semibold">Usual</th>
                <th className="py-1.5 font-semibold">Now</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const ch = concern.changed.filter((c) => c.area === a)
                const fu = concern.followups.filter((f) => f.area === a).pop()
                const ck = concern.checks.filter((k) => MEASURES[k.kind].area === a).pop()
                return (
                  <tr key={a} className="border-t border-line align-top">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <AreaIcon area={a} size={16} />
                        {AREAS[a].label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{r.usual[a]}</td>
                    <td className="py-2">
                      {ch.map((c) => (
                        <span key={c.id} className="block">
                          <b className="text-poor">{c.finding}</b>
                          <span className="text-ink-3">
                            {' '}
                            · {staffName(c.by)} {clock(c.at)}
                          </span>
                          {c.quote && <span className="block font-serif text-ink-2 italic">“{c.quote}”</span>}
                        </span>
                      ))}
                      {fu && <span className={`block ${fu.usual ? 'text-good' : 'text-poor'}`}>{fu.finding} · {clock(fu.at)}</span>}
                      {ck && <span className={`block ${ck.reading.inUsual ? 'text-good' : 'text-poor'}`}>{ck.reading.text}</span>}
                      {!ch.length && !fu && !ck && <span className="font-semibold text-unknown">Not known yet</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {concern.checks.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
            {concern.checks.map((k) => (
              <li key={k.id} className="grid grid-cols-[52px_1fr] gap-2">
                <span className="font-mono text-ink-3">{clock(k.at)}</span>
                <span className={k.reading.inUsual ? 'text-ink-2' : 'font-semibold text-poor'}>
                  {MEASURES[k.kind].label}: {k.reading.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {concern.status !== 'resolved' && (
        <Panel title={`Check ${r.preferred}`} aside={concern.unknown.length ? <span className="text-[12.5px] text-unknown">Not known: {concern.unknown.map((a) => AREAS[a].label.toLowerCase()).join(', ')}</span> : null}>
          <Checks key={concern.id} concern={concern} />
        </Panel>
      )}

      {concern.status !== 'resolved' && (
        <Panel title={plan ? 'Plan' : 'Decide'}>
          {plan && (
            <p className="mb-3 text-[13.5px]">
              <b>{plan.decision === 'escalate' ? `Escalated to ${staffName(plan.to ?? '')}` : 'Watching'}</b> since {when(plan.at)} by {staffName(plan.by)}. Recheck{' '}
              <b className={concern.overdue ? 'text-poor' : ''}>{when(plan.recheckAt)}</b> for {plan.recheck.map((a) => AREAS[a].label.toLowerCase()).join(', ')}.
            </p>
          )}
          <Decide key={concern.id + concern.plans.length} concern={concern} />
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <button type="button" className="btn" disabled={!concern.closable.ok || busy} onClick={() => void send({ type: 'resolve', by: ME, concernId: concern.id })}>
              Close: back to usual
            </button>
            {!concern.closable.ok && (
              <span className="text-[12.5px] text-ink-3">Needs a recorded outcome for {concern.closable.missing.map((a) => AREAS[a].label.toLowerCase()).join(', ')}</span>
            )}
          </div>
        </Panel>
      )}
      {concern.status === 'resolved' && <p className="text-[13.5px] text-good">Closed {when(concern.resolution!.at)} by {staffName(concern.resolution!.by)} on a recorded outcome.</p>}
    </div>
  )
}

function OffersPanel({ residentId }: { residentId: string }) {
  const { ward, send, busy } = useWard()
  const r = resident(residentId)
  const f = offerFlags(ward!).find((x) => x.residentId === residentId)!
  const offers = ward!.events.filter((e) => e.type === 'offer' && e.residentId === residentId && e.at >= f.first)
  return (
    <Panel title={`${r.name} · room ${r.room}`} aside={<StatusPill status="offers" />}>
      <DayStrip ward={ward!} residentId={r.id} />
      <p className="mt-3 text-[14px]">
        <b>Fluids offered {f.count} times, no amount ever recorded.</b> An offer is an attempt, not an outcome. Usually: {r.usual.drinking}.
      </p>
      <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
        {offers.map((o) => (
          <li key={o.id} className="font-mono">
            {when(o.at)} · {o.type === 'offer' ? o.what : ''} · {staffName(o.by)}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send({ type: 'open', by: ME, residentId, reason: `Fluids offered ${f.count} times; no amount recorded` })}>
          Open a concern
        </button>
      </div>
    </Panel>
  )
}

export default function Size() {
  const { ward } = useWard()
  const items = board(ward!)
  // Pin the selection: the board reorders as things change, and the panel must not jump to someone else.
  const [sel, setSel] = useState<{ key: string; residentId: string } | null>(() => {
    const first = items.find((i) => i.tone !== 'done')
    return first ? { key: first.key, residentId: first.residentId } : null
  })
  const concerns = deriveConcerns(ward!)
  // If the item's key changes (an "offered" flag becomes a concern), stay on the same resident.
  const selected =
    items.find((i) => i.key === sel?.key) ?? items.find((i) => i.residentId === sel?.residentId && i.tone !== 'done') ?? items.find((i) => i.tone !== 'done')
  const concern = selected?.concernId ? concerns.find((c) => c.id === selected.concernId) : selected ? concerns.find((c) => c.residentId === selected.residentId && c.status !== 'resolved') : undefined
  const ev = concerns.find((c) => c.residentId === 'evelyn')
  const steps = [
    { label: 'Open Evelyn', done: (selected?.residentId === 'evelyn' && !!ev) || !!ev?.plans.length },
    { label: 'Check an unknown', done: !!ev && (ev.checks.length > 0 || ev.followups.length > 0) },
    { label: 'Watch or escalate', done: !!ev?.plans.length },
  ]
  return (
    <div className="space-y-5">
      <Guide who="Workflow 2 · Priya, charge nurse" title="Size it up" steps={ev ? steps : steps.map((s) => ({ ...s, done: false }))} />
      {!ev && (
        <p className="card border-mid/40 bg-mid-soft/60 px-4 py-3 text-[13.5px]">
          Evelyn hasn’t been reported yet. <Link className="link" href="/spot/">Do workflow 1 first</Link>, or work the board as it is.
        </p>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel title="Board" aside={<span className="text-[12px] text-ink-3">ordered by reason, not score</span>}>
          <ul className="space-y-1.5">
            {items.map((b) => {
              const r = resident(b.residentId)
              const on = selected?.key === b.key
              return (
                <li key={b.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSel({ key: b.key, residentId: b.residentId })}
                    className={`w-full rounded-lg border border-l-4 px-3 py-2 text-left ${TONE[b.tone]} ${on ? 'border-ink bg-sunken/60' : 'border-line hover:border-line-strong'} ${b.tone === 'done' ? 'bg-sunken/40' : ''}`}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="text-[14px]">{r.name}</b>
                      <span className="font-mono text-[11.5px] text-ink-3">{r.room}</span>
                    </span>
                    <span className={`block text-[13px] font-semibold ${b.tone === 'urgent' ? 'text-poor' : 'text-ink-2'}`}>{b.reason}</span>
                    <span className="block text-[12.5px] text-ink-3">{b.detail}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>
        <div className="min-w-0">
          {selected && !selected.concernId && !concern ? <OffersPanel residentId={selected.residentId} /> : concern ? <ConcernPanel concern={concern} /> : <Panel title="Nothing selected">Pick an item on the board.</Panel>}
          {ev?.plans.length ? (
            <p className="mt-4 text-right text-[13.5px]">
              <Link href="/handover/" className="btn btn-primary">
                Continue to the shift change
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
