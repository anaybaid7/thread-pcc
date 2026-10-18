'use client'

import type { AttemptView, DecisionInput, DraftSource, HandoverDraft } from '@thread/engine'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { DebriefPanel } from '@/components/sim/DebriefPanel'
import { DecisionPanel, FeedbackCard } from '@/components/sim/DecisionPanel'
import { EventDeck, EventTimeline, KindMark } from '@/components/sim/EventTimeline'
import { HandoverEditor } from '@/components/sim/HandoverEditor'
import { ResidentCard } from '@/components/sim/ResidentCard'
import { BinIcon } from '@/components/sim/SortBoard'
import { ThreadView } from '@/components/sim/ThreadView'
import { ApiError, backendFor, local, server, STATIC, type Health, type Mode, type Snapshot } from '@/lib/sim'

export default function PlayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Play />
    </Suspense>
  )
}

function Loading() {
  return <output className="card block animate-pulse p-6 text-ink-3">Setting up the shift…</output>
}

const STAGES: { key: AttemptView['stage']; label: string }[] = [
  { key: 'A', label: 'Baseline' },
  { key: 'B', label: 'The change' },
  { key: 'C', label: 'What next' },
  { key: 'handover', label: 'Handover' },
  { key: 'debrief', label: 'Debrief' },
]

function Progress({ stage }: { stage: AttemptView['stage'] }) {
  const at = STAGES.findIndex((s) => s.key === stage)
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {STAGES.map((s, i) => (
        <li key={s.key} className="flex flex-1 flex-col gap-1" aria-current={i === at ? 'step' : undefined}>
          <span className={`h-1.5 rounded-full transition-colors duration-500 ${i < at ? 'bg-accent' : i === at ? 'bg-accent/60' : 'bg-line'}`} />
          <span className={`hidden text-[11.5px] font-medium sm:block ${i === at ? 'text-accent-strong' : 'text-ink-3'}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

function ModeChip({ mode, health }: { mode: Mode; health: Health | null | undefined }) {
  if (mode === 'practice') return <span className="chip border-mid/40 bg-mid-soft text-mid">Practice · not saved</span>
  const where = health?.database.provider === 'vultr' ? 'Vultr' : health?.database.provider === 'pglite' ? 'local DB' : 'PostgreSQL'
  return <span className="chip border-good/40 bg-good-soft text-good">● Saved · {where}</span>
}

function Prebrief({ view, busy, onStart }: { view: AttemptView; busy: boolean; onStart: () => void }) {
  const name = view.scenario.resident.preferredName
  const steps: [React.ReactNode, string][] = [
    [<span key="a" className="text-[18px]">◎</span>, `Learn ${name}’s usual`],
    [<KindMark key="b" kind="observation" size={22} />, 'Draw events one by one'],
    [<BinIcon key="c" tag="assumption" />, 'Decide with what you know'],
    [<span key="d" className="text-[18px]">↺</span>, 'Debrief, then replay'],
  ]
  return (
    <section className="card flip-in overflow-hidden" aria-labelledby="prebrief-title">
      <div className="bg-gradient-to-r from-accent to-accent-strong p-5 text-white sm:p-6">
        <p className="text-[12px] font-semibold tracking-wider uppercase opacity-80">{view.scenario.title}</p>
        <h2 id="prebrief-title" className="mt-1 text-[26px] text-white">
          Off day, or something more?
        </h2>
      </div>
      <div className="p-5 sm:p-6">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {steps.map(([icon, t], i) => (
            <li key={t} className="flex flex-col items-center gap-2 rounded-xl bg-sunken/70 p-3 text-center text-[13.5px] font-medium">
              <span className="grid size-10 place-items-center rounded-full bg-surface text-accent shadow-sm" aria-hidden="true">
                {icon}
              </span>
              <span>
                <span className="text-ink-3">{i + 1}. </span>
                {t}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary btn-lg" onClick={onStart} disabled={busy}>
            Start the shift →
          </button>
          <span className="text-[12.5px] text-ink-3">~8 min · fictional · not clinical guidance</span>
        </div>
      </div>
    </section>
  )
}

function ObservePanel() {
  const tips: [React.ReactNode, string][] = [
    [<span key="a" className="text-[16px] text-accent">≠</span>, 'Different for her?'],
    [<BinIcon key="b" tag="observed" />, 'Seen, or assumed?'],
    [<BinIcon key="c" tag="unknown" />, 'What nobody knows'],
  ]
  return (
    <section className="card p-4 sm:p-5" aria-label="What to watch for">
      <p className="eyebrow">Watch for</p>
      <ul className="mt-3 space-y-2">
        {tips.map(([icon, t]) => (
          <li key={t} className="flex items-center gap-3 rounded-lg bg-sunken/60 px-3 py-2.5 text-[14px] font-medium">
            <span className="grid size-7 place-items-center" aria-hidden="true">
              {icon}
            </span>
            {t}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12.5px] text-ink-3">A decision appears when there is something to decide.</p>
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
          {error.status === 409 ? 'Reload' : 'Try again'}
        </button>
        {onPractice && (
          <button className="btn" onClick={onPractice}>
            Practise without saving
          </button>
        )}
      </div>
    </div>
  )
}

function Play() {
  const params = useSearchParams()
  const router = useRouter()
  const scenarioId = params.get('scenario') ?? 'evelyn'
  const attemptParam = params.get('attempt')
  const fresh = params.get('new') === '1'
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

  const begin = useCallback(
    async function boot() {
      const s = await run(
        () => {
          if (STATIC) {
            const resumed = fresh ? null : local.resume(scenarioId)
            return resumed ? Promise.resolve(resumed) : local.create(scenarioId)
          }
          return attemptParam ? server.load(attemptParam) : server.create(scenarioId)
        },
        () => void boot(),
      )
      if (s?.mode === 'saved' && s.id !== attemptParam) router.replace(`/play?attempt=${s.id}`)
    },
    [run, scenarioId, attemptParam, router, fresh],
  )

  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (!STATIC) void server.health().then(setHealth)
    void begin()
  }, [begin])

  // Bring the new task into view when the phase changes.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && snap?.view.canAdvance && snap.view.phase !== 'prebrief') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, snap])

  if (!snap) return error ? <ErrorPanel error={error} onRetry={() => retry?.()} onPractice={STATIC ? undefined : practise} /> : <Loading />

  const view = snap.view
  const decide = (input: DecisionInput) => void run(() => b!.decide(snap, view.decision!.id, input))
  const submit = (draft: HandoverDraft, from: DraftSource | 'blank') => void run(() => b!.submit(snap, draft, from))
  const replay = async (course: 'same' | 'other') => {
    const s = await run(() => b!.replay(snap, course))
    if (s?.mode === 'saved') router.replace(`/play?attempt=${s.id}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const events = view.timeline.filter((t) => t.type === 'event').length
  const showFeedback = view.feedback && view.phase === 'playing'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[24px] sm:text-[28px]">
          {view.scenario.resident.name}
          {view.now && (
            <span key={view.now.label} className="pop ml-3 inline-block rounded-full bg-ink px-3 py-1 align-middle font-sans text-[14px] font-semibold text-white tabular-nums">
              {view.now.label}
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {snap.replayOf && <span className="chip text-ink-3">replay</span>}
          <ModeChip mode={snap.mode} health={health} />
        </div>
      </div>
      <Progress stage={view.stage} />

      {error && (
        <ErrorPanel
          error={error}
          onRetry={() => (retry ? retry() : snap.mode === 'saved' ? void run(() => server.load(snap.id)) : setError(null))}
          onPractice={snap.mode === 'saved' && error.unavailable ? practise : undefined}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <ResidentCard view={view} />
        </aside>

        <div className="min-w-0 space-y-5">
          {view.phase === 'prebrief' && (
            <>
              <Prebrief view={view} busy={busy} onStart={next} />
              <ThreadView view={view} />
            </>
          )}

          {(view.phase === 'playing' || view.phase === 'decision') && (
            <>
              <ThreadView view={view} />
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="min-w-0">
                  <EventTimeline view={view} />
                  {view.canAdvance && <EventDeck onDraw={next} busy={busy} count={events} />}
                </div>
                <div className="min-w-0 space-y-5 xl:sticky xl:top-4">
                  {view.phase === 'decision' && view.decision ? (
                    <DecisionPanel key={view.decision.id} decision={view.decision} evidenceCount={events} busy={busy} onSubmit={decide} />
                  ) : showFeedback ? (
                    <FeedbackCard key={view.feedback!.decisionId} feedback={view.feedback!} />
                  ) : (
                    <ObservePanel />
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
              <ThreadView view={view} />
              <div className="grid items-start gap-5 xl:grid-cols-2">
                <EventTimeline view={view} />
                {view.debrief.handover && <SubmittedHandover view={view} />}
              </div>
              {snap.mode === 'saved' && (
                <p className="text-center text-[13px] text-ink-3">
                  Saved and locked. <Link className="link" href="/attempts/">All attempts</Link>
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
      <h2 id="your-handover" className="text-[18px]">
        Your handover
      </h2>
      <p className="text-[12.5px] text-ink-3">From {h.startedFrom === 'gemini' ? 'an AI draft' : h.startedFrom === 'template' ? 'the template' : 'scratch'}, as you submitted it</p>
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
