'use client'

import type { DraftSection, DraftSource, Fact, HandoverDraft } from '@thread/engine'
import { useState } from 'react'
import type { DraftResponse, Mode } from '@/lib/sim'
import { KIND } from './EventTimeline'

type SectionKey = 'situation' | 'background' | 'assessment' | 'recommendation'

const SECTIONS: { key: SectionKey; letter: string; title: string; hint: string; allowUnknown: boolean }[] = [
  { key: 'situation', letter: 'S', title: 'Situation', hint: 'What is happening now, compared with her usual?', allowUnknown: false },
  { key: 'background', letter: 'B', title: 'Background', hint: 'What is usual for her? What relevant context is documented?', allowUnknown: false },
  { key: 'assessment', letter: 'A', title: 'Assessment: what was observed', hint: 'What was actually seen, with day and time. Offered is not the same as consumed.', allowUnknown: false },
  { key: 'recommendation', letter: 'R', title: 'Recommendation / request', hint: 'What are you asking for? An assessment, what to record, who to tell. Not a diagnosis or treatment.', allowUnknown: true },
]

const EMPTY: HandoverDraft = {
  situation: { text: '', factIds: [] },
  background: { text: '', factIds: [] },
  assessment: { text: '', factIds: [] },
  recommendation: { text: '', factIds: [] },
  unknowns: [],
}

const GROUPS: { title: string; match: (f: Fact) => boolean }[] = [
  { title: 'Her usual', match: (f) => f.kind === 'baseline' },
  { title: 'What happened', match: (f) => f.kind !== 'baseline' && f.kind !== 'unknown' },
  { title: 'Not known', match: (f) => f.kind === 'unknown' },
]

function FactChip({ fact, onRemove }: { fact: Fact; onRemove?: () => void }) {
  const color = fact.kind === 'baseline' ? 'var(--color-accent)' : KIND[fact.kind].color
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border bg-surface py-0.5 pr-1 pl-2 text-[12px]" style={{ borderColor: color }}>
      <span className="truncate" title={fact.text}>
        {fact.when ? `${fact.when} · ` : ''}
        {fact.text}
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded px-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label={`Stop citing: ${fact.text}`}>
          ×
        </button>
      )}
    </span>
  )
}

function SectionEditor({
  label,
  hint,
  value,
  facts,
  allowUnknown,
  onChange,
  onRemove,
}: {
  label: React.ReactNode
  hint: string
  value: DraftSection
  facts: Fact[]
  allowUnknown: boolean
  onChange: (v: DraftSection) => void
  onRemove?: () => void
}) {
  const byId = new Map(facts.map((f) => [f.id, f]))
  const citable = facts.filter((f) => (allowUnknown || f.kind !== 'unknown') && !value.factIds.includes(f.id))
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <label className="block min-w-0 flex-1">
          <span className="text-[14.5px] font-semibold">{label}</span>
          <span className="block text-[12.5px] text-ink-3">{hint}</span>
          <textarea
            className="field mt-2 min-h-[64px] resize-y leading-snug"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
            value={value.text}
            maxLength={1200}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
          />
        </label>
        {onRemove && (
          <button type="button" className="btn px-2 py-1 text-[12.5px]" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-medium text-ink-3">Cites:</span>
        {value.factIds.length === 0 && <span className="text-[12px] text-ink-3 italic">no facts yet</span>}
        {value.factIds.map((id) => {
          const f = byId.get(id)
          return f ? <FactChip key={id} fact={f} onRemove={() => onChange({ ...value, factIds: value.factIds.filter((x) => x !== id) })} /> : null
        })}
        {citable.length > 0 && (
          <select
            className="w-44 max-w-full rounded-md border border-dashed border-line-strong bg-surface px-1.5 py-0.5 text-[12px] text-ink-2"
            value=""
            aria-label="Cite a fact"
            onChange={(e) => e.target.value && onChange({ ...value, factIds: [...value.factIds, e.target.value] })}
          >
            <option value="">+ cite a fact</option>
            {citable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.when ? `${f.when} · ` : ''}
                {f.text.slice(0, 80)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

export function HandoverEditor({
  handover,
  mode,
  geminiReady,
  busy,
  onDraft,
  onSubmit,
}: {
  handover: { to: string; purpose: string; facts: Fact[] }
  mode: Mode
  geminiReady: boolean
  busy: boolean
  onDraft: (factIds: string[]) => Promise<DraftResponse>
  onSubmit: (draft: HandoverDraft, startedFrom: DraftSource | 'blank') => void
}) {
  const facts = handover.facts
  const [selected, setSelected] = useState<string[]>(facts.map((f) => f.id))
  const [draft, setDraft] = useState<HandoverDraft | null>(null)
  const [meta, setMeta] = useState<DraftResponse | null>(null)
  const [startedFrom, setStartedFrom] = useState<DraftSource | 'blank'>('blank')
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)

  const requestDraft = async () => {
    setDrafting(true)
    setDraftError(null)
    try {
      const r = await onDraft(selected)
      setDraft(r.draft)
      setMeta(r)
      setStartedFrom(r.source)
    } catch (e) {
      setDraftError((e as Error).message)
    } finally {
      setDrafting(false)
    }
  }

  const set = (key: SectionKey, v: DraftSection) => setDraft((d) => ({ ...(d ?? EMPTY), [key]: v }))
  const canSubmit = !!draft && draft.situation.text.trim() && draft.assessment.text.trim()

  return (
    <section className="card border-2 border-accent/60 p-4 sm:p-5" aria-labelledby="handover-title">
      <p className="eyebrow text-accent">Handover · SBAR</p>
      <h2 id="handover-title" className="mt-1 text-[22px]">
        Hand over to {handover.to}
      </h2>
      <p className="mt-1 text-[14.5px] text-ink-2">{handover.purpose}</p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div>
          <h3 className="font-sans text-[14.5px] font-semibold">Facts you can use</h3>
          <p className="text-[12.5px] text-ink-3">Untick anything you don’t want in the draft. Only these facts can be cited.</p>
          <div className="mt-2 max-h-[460px] space-y-3 overflow-y-auto pr-1">
            {GROUPS.map((g) => {
              const list = facts.filter(g.match)
              if (!list.length) return null
              return (
                <fieldset key={g.title}>
                  <legend className="eyebrow font-sans">{g.title}</legend>
                  <ul className="mt-1.5 space-y-1">
                    {list.map((f) => (
                      <li key={f.id}>
                        <label className="flex cursor-pointer gap-2 rounded-md p-1.5 text-[13px] hover:bg-sunken">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-[var(--color-accent)]"
                            checked={selected.includes(f.id)}
                            onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, f.id] : cur.filter((x) => x !== f.id)))}
                          />
                          <span>
                            {f.when && <b className="tabular-nums">{f.when} </b>}
                            {f.text}
                            <span className="block text-[11.5px] text-ink-3">{f.source}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )
            })}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={requestDraft} disabled={drafting || busy}>
              {drafting ? 'Drafting…' : geminiReady ? '✦ Draft with Gemini' : 'Draft from the template'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={drafting || busy}
              onClick={() => {
                setDraft(EMPTY)
                setMeta(null)
                setStartedFrom('blank')
              }}
            >
              Write it myself
            </button>
          </div>
          {!geminiReady && (
            <p className="mt-2 text-[12.5px] text-ink-3">
              {mode === 'practice'
                ? 'AI drafting needs the THREAD server; practice mode uses the standard template.'
                : 'Gemini isn’t configured on this server, so drafts use the standard template.'}
            </p>
          )}
          {draftError && (
            <p role="alert" className="mt-2 rounded-lg bg-poor-soft p-2.5 text-[13.5px] text-poor">
              {draftError}
            </p>
          )}

          {meta && (
            <div className={`mt-3 rounded-lg border p-3 text-[13px] ${meta.source === 'gemini' ? 'border-[#c9b8e0] bg-[#f5f0fb]' : 'border-line bg-sunken/60'}`} aria-live="polite">
              {meta.source === 'gemini' ? (
                <p>
                  <b>✦ AI-assisted draft</b> ({meta.model}). Gemini only rephrased the facts listed here, and every section was checked against them.
                  It can still be wrong or incomplete. <b>Review and edit every line</b> before you submit. It does not replace your own assessment or
                  your facility’s reporting procedures.
                </p>
              ) : (
                <p>
                  <b>Standard template.</b> {meta.fallbackReason}
                  {meta.validation.length > 0 && <span className="mt-1 block text-ink-3">Checks that failed: {meta.validation.slice(0, 3).join(' ')}</span>}
                  <span className="mt-1 block">Edit it into your own words before you submit.</span>
                </p>
              )}
            </div>
          )}

          {draft ? (
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (canSubmit) onSubmit(draft, startedFrom)
              }}
            >
              {SECTIONS.map((s) => (
                <SectionEditor
                  key={s.key}
                  label={
                    <>
                      <span className="mr-1.5 inline-grid size-6 place-items-center rounded bg-accent text-[12.5px] text-white">{s.letter}</span>
                      {s.title}
                    </>
                  }
                  hint={s.hint}
                  value={draft[s.key]}
                  facts={facts}
                  allowUnknown={s.allowUnknown}
                  onChange={(v) => set(s.key, v)}
                />
              ))}
              <div className="rounded-lg border border-dashed border-unknown/60 bg-[#fbf6f0] p-3">
                <p className="text-[14.5px] font-semibold">What isn’t known</p>
                <p className="text-[12.5px] text-ink-3">Gaps stay gaps. Listing them stops anyone mistaking “not recorded” for “fine”.</p>
                <div className="mt-2 space-y-2">
                  {draft.unknowns.map((u, i) => (
                    <SectionEditor
                      key={i}
                      label={`Unknown ${i + 1}`}
                      hint=""
                      value={u}
                      facts={facts.filter((f) => f.kind === 'unknown')}
                      allowUnknown
                      onChange={(v) => setDraft((d) => d && { ...d, unknowns: d.unknowns.map((x, j) => (j === i ? v : x)) })}
                      onRemove={() => setDraft((d) => d && { ...d, unknowns: d.unknowns.filter((_, j) => j !== i) })}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="btn mt-2 text-[13px]"
                  onClick={() => setDraft((d) => d && { ...d, unknowns: [...d.unknowns, { text: '', factIds: [] }] })}
                  disabled={draft.unknowns.length >= 10}
                >
                  + Add an unknown
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                <button className="btn btn-primary btn-lg" disabled={!canSubmit || busy}>
                  {busy ? 'Saving…' : 'Submit handover and see your debrief'}
                </button>
                {!canSubmit && <span className="text-[13px] text-ink-3">Situation and assessment can’t be empty.</span>}
              </div>
            </form>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-line-strong p-4 text-[14px] text-ink-3">
              Start from a draft or write it yourself. Either way, the handover you submit is yours, and it is scored on clarity: situation, background,
              timed observations, a clear request, and what isn’t known.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
