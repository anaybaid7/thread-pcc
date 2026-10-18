'use client'

import type { AttemptView, DecisionInput, DraftSource, HandoverDraft } from '@thread/engine'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BaselineChart } from '@/components/sim/BaselineChart'
import { DebriefPanel } from '@/components/sim/DebriefPanel'
import { DecisionPanel, FeedbackCard } from '@/components/sim/DecisionPanel'
import { EventTimeline } from '@/components/sim/EventTimeline'
import { HandoverEditor } from '@/components/sim/HandoverEditor'
import { ResidentCard } from '@/components/sim/ResidentCard'
import { ApiError, backendFor, local, server, STATIC, type Health, type Mode, type Snapshot } from '@/lib/sim'

export default function PlayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Play />
    </Suspense>
  )
}

function Loading() {
  return (
    <output className="card block animate-pulse p-6 text-ink-3">Setting up the shift…</output>
  )
}

const STAGES: { key: AttemptView['stage']; label: string }[] = [
  { key: 'A', label: 'Her baseline' },
  { key: 'B', label: 'The first off day' },
  { key: 'C', label: 'What happens next' },
  { key: 'handover', label: 'Handover' },
  { key: 'debrief', label: 'Debrief' },
]

function Progress({ stage }: { stage: AttemptView['stage'] }) {
  const at = STAGES.findIndex((s) => s.key === stage)
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[12.5px]" aria-label="Progress">
      {STAGES.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1" aria-current={i === at ? 'step' : undefined}>
          <span
            className={`rounded-full px-2.5 py-1 font-medium ${i === at ? 'bg-accent text-white' : i < at ? 'bg-accent-soft text-accent-strong' : 'bg-sunken text-ink-3'}`}
          >
            {i < at ? '✓ ' : ''}
            {s.label}
          </span>
          {i < STAGES.length - 1 && (
            <span className="text-line-strong" aria-hidden="true">
              —
            </span>
          )}
        </li>
      ))}
    </ol>
  )
}

function ModeChip({ mode, health }: { mode: Mode; health: Health | null | undefined }) {
  if (mode === 'practice')
    return (
      <span className="chip border-mid/40 bg-mid-soft text-mid" title="Runs in your browser; nothing is stored">
        Practice mode · not saved
      </span>
    )
  const where = health?.database.provider === 'vultr' ? 'Vultr PostgreSQL' : health?.database.provider === 'pglite' ? 'local PostgreSQL' : 'PostgreSQL'
  return (
    <span className="chip border-good/40 bg-good-soft text-good" title="Every step is saved as it happens">
      ● Saved to {where}
    </span>
  )
}

function Prebrief({ view, busy, onStart }: { view: AttemptView; busy: boolean; onStart: () => void }) {
  const name = view.scenario.resident.preferredName
  return (
    <section className="card border-2 border-accent/60 p-5 sm:p-6" aria-labelledby="prebrief-title">
      <p className="eyebrow text-accent">Before the shift</p>
      <h2 id="prebrief-title" className="mt-1 text-[24px]">
        Get to know {name}’s usual first
      </h2>
      <ol className="mt-3 grid gap-2 text-[14.5px] sm:grid-cols-2">
        {[
          ['Learn her baseline', `Read ${name}’s usual pattern on the left and in the chart. Every change is judged against it.`],
          ['Reveal events one at a time', 'Press “Next event”. Nothing happens until you do: no timers, no surprises in the background.'],
          ['Decide with what you know', 'At each decision point: what changed, what’s fact, assumption or unknown, and what you do.'],
          ['Hand over, then debrief', 'Write a short SBAR handover, then see your reasoning scored and replay the other version of the day.'],
        ].map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-lg bg-sunken/70 p-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[12.5px] font-bold text-white" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <b className="block">{t}</b>
              <span className="text-[13.5px] text-ink-2">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary btn-lg" onClick={onStart} disabled={busy}>
          Start {view.scenario.resident.preferredName === 'Evelyn' ? 'Monday’s day shift' : 'the shift'} →
        </button>
        <span className="text-[13px] text-ink-3">About 8 minutes · fictional resident · not clinical guidance</span>
      </div>
    </section>
  )
}

function NextBar({ view, busy, onNext }: { view: AttemptView; busy: boolean; onNext: () => void }) {
  if (!view.canAdvance || view.phase === 'prebrief') return null
  const events = view.timeline.filter((t) => t.type === 'event').length
  return (
    <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line-strong bg-surface/95 p-3 shadow-lg backdrop-blur">
      <button className="btn btn-primary btn-lg" onClick={onNext} disabled={busy} aria-keyshortcuts="n">
        {busy ? 'Saving…' : 'Next event →'}
      </button>
      <span className="text-[13px] text-ink-3">
        {events} revealed · each press reveals exactly one event
      </span>
    </div>
  )
}

function ObservePanel({ view }: { view: AttemptView }) {
  const name = view.scenario.resident.preferredName
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="observe-title">
      <p className="eyebrow">Your job right now</p>
      <h2 id="observe-title" className="mt-1 text-[19px]">
        Notice, compare, don’t conclude yet
      </h2>
      <ul className="mt-2 space-y-1.5 text-[14px] text-ink-2">
        <li>• Compare each event with {name}’s usual: is it different for <i>her</i>?</li>
        <li>• Keep what was <b>observed</b> apart from what someone <b>assumes</b>, and from what <b>nobody knows</b>.</li>
        <li>• One unusual observation can be ambiguous. Watch for a pattern across areas and across time.</li>
      </ul>
      <p className="mt-3 text-[13px] text-ink-3">A decision point will appear when there’s something to decide.</p>
    </section>
  )
}

function ErrorPanel({ error, onRetry, onPractice }: { error: ApiError; onRetry: () => void; onPractice?: () => void }) {
  return (
    <div role="alert" className="card border-2 border-poor/50 bg-poor-soft/50 p-4">
      <p className="font-semibold text-poor">{error.unavailable ? 'Can’t save right now' : error.status === 409 ? 'This attempt changed' : 'That didn’t work'}</p>
      <p className="mt-1 text-[14px]">{error.message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn" onClick={onRetry}>
          {error.status === 409 ? 'Reload the attempt' : 'Try again'}
        </button>
        {onPractice && (
          <button className="btn" onClick={onPractice}>
            Practise without saving
          </button>
        )}
      </div>
      {onPractice && <p className="mt-2 text-[12.5px] text-ink-3">Practice mode runs the same scenario in your browser. Nothing is stored, and AI drafting is off.</p>}
    </div>
  )
}

function Play() {
  const params = useSearchParams()
  const router = useRouter()
  const scenarioId = params.get('scenario') ?? 'evelyn'
  const attemptParam = params.get('attempt')
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [health, setHealth] = useState<Health | null | undefined>(undefined)
  const [retry, setRetry] = useState<(() => void) | null>(null)
  const booted = useRef(false)

  const run = useCallback(async (fn: () => Promise<Snapshot>, again?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      const s = await fn()
      setSnap(s)
      setRetry(null)
      return s
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(500, (e as Error).message))
      setRetry(() => again ?? null)
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const begin = useCallback(async function boot() {
    const s = await run(
      () => (STATIC ? local.create(scenarioId) : attemptParam ? server.load(attemptParam) : server.create(scenarioId)),
      () => void boot(),
    )
    if (s?.mode === 'saved' && s.id !== attemptParam) router.replace(`/play?attempt=${s.id}`)
  }, [run, scenarioId, attemptParam, router])

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (!STATIC) void server.health().then(setHealth)
    void begin()
  }, [begin])

  // Bring the new task into view when the phase changes: the decision panel, or the top for the handover and debrief.
  const phase = snap?.view.phase
  useEffect(() => {
    if (phase === 'decision') document.getElementById('decision-title')?.scrollIntoView({ behavior: 'smooth', block: window.innerWidth < 1280 ? 'start' : 'nearest' })
    if (phase === 'handover' || phase === 'complete' || phase === 'prebrief') window.scrollTo({ top: 0 })
  }, [phase])

  const practise = () => void run(() => local.create(snap?.view.scenario.id ?? scenarioId))

  const b = snap ? backendFor(snap.mode) : null
  const next = useCallback(() => {
    if (snap && b && !busy) void run(() => b.advance(snap), () => void (snap.mode === 'saved' ? run(() => server.load(snap.id)) : null))
  }, [snap, b, busy, run])

  // "n" reveals the next event, when nothing else has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && snap?.view.canAdvance && snap.view.phase !== 'prebrief') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, snap])

  if (!snap)
    return error ? <ErrorPanel error={error} onRetry={() => retry?.()} onPractice={STATIC ? undefined : practise} /> : <Loading />

  const view = snap.view
  const decide = (input: DecisionInput) => void run(() => b!.decide(snap, view.decision!.id, input))
  const submit = (draft: HandoverDraft, from: DraftSource | 'blank') => void run(() => b!.submit(snap, draft, from))
  const replay = async (course: 'same' | 'other') => {
    const s = await run(() => b!.replay(snap, course))
    if (s?.mode === 'saved') router.replace(`/play?attempt=${s.id}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const evidenceCount = view.timeline.filter((t) => t.type === 'event').length
  const showFeedback = view.feedback && view.phase === 'playing'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{view.scenario.title}</p>
          <h1 className="mt-1 text-[26px] sm:text-[30px]">
            {view.scenario.subtitle}
            {view.now && <span className="ml-2 align-middle font-sans text-[15px] font-medium text-ink-3 tabular-nums">· {view.now.label}</span>}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <ModeChip mode={snap.mode} health={health} />
          {snap.replayOf && <span className="text-[12px] text-ink-3">Replay of an earlier attempt</span>}
        </div>
      </div>
      <Progress stage={view.stage} />

      {error && <ErrorPanel error={error} onRetry={() => (retry ? retry() : snap.mode === 'saved' ? void run(() => server.load(snap.id)) : setError(null))} onPractice={snap.mode === 'saved' && error.unavailable ? practise : undefined} />}

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <ResidentCard view={view} />
          {snap.mode === 'practice' && (
            <p className="rounded-lg border border-mid/30 bg-mid-soft/60 p-3 text-[12.5px] text-ink-2">
              Practice mode: the same scenario engine runs in your browser. Nothing is saved{STATIC ? '; run THREAD locally to save attempts in PostgreSQL and use AI handover drafts.' : '.'}
            </p>
          )}
        </aside>

        <div className="min-w-0 space-y-5">
          {view.phase === 'prebrief' && (
            <>
              <Prebrief view={view} busy={busy} onStart={next} />
              <BaselineChart view={view} />
            </>
          )}

          {(view.phase === 'playing' || view.phase === 'decision') && (
            <>
              <BaselineChart view={view} />
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                <div className="min-w-0">
                  <EventTimeline view={view} />
                  <NextBar view={view} busy={busy} onNext={next} />
                </div>
                <div className="min-w-0 space-y-5 xl:sticky xl:top-4">
                  {view.phase === 'decision' && view.decision ? (
                    <DecisionPanel key={view.decision.id} decision={view.decision} evidenceCount={evidenceCount} busy={busy} onSubmit={decide} />
                  ) : showFeedback ? (
                    <FeedbackCard feedback={view.feedback!} canContinue={view.canAdvance} busy={busy} />
                  ) : (
                    <ObservePanel view={view} />
                  )}
                </div>
              </div>
            </>
          )}

          {view.phase === 'handover' && view.handover && (
            <>
              <HandoverEditor
                handover={view.handover}
                mode={snap.mode}
                geminiReady={snap.mode === 'saved' && !!health?.gemini.configured}
                busy={busy}
                onDraft={(ids) => b!.draft(snap, ids)}
                onSubmit={submit}
              />
              <EventTimeline view={view} />
            </>
          )}

          {view.phase === 'complete' && view.debrief && (
            <>
              <DebriefPanel debrief={view.debrief} name={view.scenario.resident.preferredName} busy={busy} onReplay={replay} />
              <BaselineChart view={view} />
              <div className="grid items-start gap-5 xl:grid-cols-2">
                <EventTimeline view={view} />
                {view.debrief.handover && <SubmittedHandover view={view} />}
              </div>
              {snap.mode === 'saved' && (
                <p className="text-[13px] text-ink-3">
                  This attempt is saved and can’t be changed. <Link className="link" href="/attempts/">See all attempts</Link>
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SubmittedHandover({ view }: { view: AttemptView }) {
  const h = view.debrief!.handover!
  const rows: [string, string][] = [
    ['S', h.draft.situation.text],
    ['B', h.draft.background.text],
    ['A', h.draft.assessment.text],
    ['R', h.draft.recommendation.text],
  ]
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="your-handover">
      <h2 id="your-handover" className="text-[19px]">
        Your handover
      </h2>
      <p className="text-[12.5px] text-ink-3">
        Started from {h.startedFrom === 'gemini' ? 'an AI-assisted draft' : h.startedFrom === 'template' ? 'the standard template' : 'a blank page'}; submitted as written.
      </p>
      <dl className="mt-3 space-y-2 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="grid size-6 shrink-0 place-items-center rounded bg-accent text-[12.5px] font-bold text-white">{k}</dt>
            <dd className="whitespace-pre-line">{v || <span className="text-ink-3 italic">(empty)</span>}</dd>
          </div>
        ))}
        {h.draft.unknowns.length > 0 && (
          <div className="flex gap-3">
            <dt className="grid size-6 shrink-0 place-items-center rounded border-2 border-dashed border-unknown text-[12.5px] font-bold text-unknown">?</dt>
            <dd>
              <ul className="list-disc pl-4">
                {h.draft.unknowns.map((u, i) => (
                  <li key={i}>{u.text}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}
