'use client'

import type { AttemptView, DecisionInput, DraftSource, HandoverDraft } from '@thread/engine'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { DebriefPanel } from '@/components/sim/DebriefPanel'
import { DecisionPanel, FeedbackCard } from '@/components/sim/DecisionPanel'
import { EventTimeline, KIND, KindMark, TransportBar } from '@/components/sim/EventTimeline'
import { HandoverEditor } from '@/components/sim/HandoverEditor'
import { ResidentCard } from '@/components/sim/ResidentCard'
import { ShiftTimeline } from '@/components/sim/ShiftTimeline'
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
  { key: 'A', label: 'Briefing' },
  { key: 'B', label: 'The change' },
  { key: 'C', label: 'What next' },
  { key: 'handover', label: 'Handover' },
  { key: 'debrief', label: 'Debrief' },
]

const fmtT = (t: number, days: string[]) => {
  const d = Math.floor(t / 1440)
  const m = t % 1440
  return `${(days[d] ?? '').slice(0, 3)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function Progress({ stage }: { stage: AttemptView['stage'] }) {
  const at = STAGES.findIndex((s) => s.key === stage)
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {STAGES.map((s, i) => (
        <li key={s.key} className="flex flex-1 flex-col gap-1" aria-current={i === at ? 'step' : undefined}>
          <span className={`h-1 rounded-full transition-colors duration-500 ${i < at ? 'bg-ink' : i === at ? 'bg-ink/50' : 'bg-line'}`} />
          <span className={`hidden text-[11.5px] font-medium sm:block ${i === at ? 'text-ink' : 'text-ink-3'}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  )
}

function ModeChip({ mode, health }: { mode: Mode; health: Health | null | undefined }) {
  if (mode === 'practice') return <span className="chip border-mid/40 text-mid">Practice · not saved</span>
  const where = health?.database.provider === 'vultr' ? 'Vultr PostgreSQL' : health?.database.provider === 'pglite' ? 'local DB' : 'PostgreSQL'
  return <span className="chip border-good/40 text-good">Saved · {where}</span>
}

function Prebrief({ view, busy, onStart }: { view: AttemptView; busy: boolean; onStart: () => void }) {
  const w = view.window
  const rubric: [string, number][] = [
    ['Recognising change from baseline', 30],
    ['Communication and action', 30],
    ['Facts vs. assumptions vs. unknowns', 25],
    ['Handover clarity', 15],
  ]
  return (
    <section className="card enter overflow-hidden" aria-labelledby="prebrief-title">
      <div className="border-b border-line px-5 pt-5 pb-4 sm:px-6">
        <p className="eyebrow">Briefing</p>
        <h2 id="prebrief-title" className="mt-1 text-[24px]">
          {view.scenario.title}
        </h2>
      </div>
      <dl className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <dt className="eyebrow">Your role</dt>
          <dd className="mt-1.5 text-[14px]">{view.scenario.role.replace(/^You are /, '')}</dd>
        </div>
        <div className="p-5">
          <dt className="eyebrow">The shift</dt>
          <dd className="mt-1.5 font-mono text-[13.5px]">
            {fmtT(w.start, w.days)} to {fmtT(w.end, w.days)}
          </dd>
          <dd className="mt-1 text-[13px] text-ink-3">Entries arrive one at a time. Nothing happens until you advance.</dd>
        </div>
        <div className="p-5">
          <dt className="eyebrow">Assessed on</dt>
          <dd className="mt-1.5">
            <ul className="space-y-1 text-[13px]">
              {rubric.map(([l, n]) => (
                <li key={l} className="flex justify-between gap-3">
                  <span>{l}</span>
                  <span className="font-mono text-ink-3">{n}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 sm:px-6">
        <button className="btn btn-primary" onClick={onStart} disabled={busy}>
          Start the shift
        </button>
        <span className="text-[12.5px] text-ink-3">Fictional resident · about 8 minutes · not clinical guidance</span>
      </div>
    </section>
  )
}

/** What is known so far: entries by kind, the open unknowns, and who knows of the change. */
function KnownSoFar({ view }: { view: AttemptView }) {
  const events = view.timeline.filter((t) => t.type === 'event')
  const count = (k: keyof typeof KIND) => events.filter((e) => e.kind === k).length
  const unknowns = events.filter((e) => e.kind === 'unknown')
  const knowers = view.people.filter((p) => p.since != null)
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="known-title">
      <h2 id="known-title" className="text-[18px]">
        Known so far
      </h2>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        {(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => (
          <div key={k} className="flex flex-col-reverse rounded-lg border border-line py-2">
            <dt className="mt-0.5 flex items-center justify-center gap-1 text-[11.5px] text-ink-3">
              <KindMark kind={k} size={12} />
              {KIND[k].label}
            </dt>
            <dd className="font-mono text-[20px] font-semibold tabular-nums">{count(k)}</dd>
          </div>
        ))}
      </dl>
      {unknowns.length > 0 && (
        <div className="mt-4">
          <p className="eyebrow">Open unknowns</p>
          <ul className="mt-1.5 space-y-1 text-[13.5px] text-ink-2">
            {unknowns.map((u) => (
              <li key={u.id} className="grid grid-cols-[44px_1fr] gap-2">
                <span className="font-mono text-[12px] text-ink-3">{u.clock}</span>
                {u.fact}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <p className="eyebrow">Aware of the change</p>
        <p className="mt-1.5 text-[13.5px] text-ink-2">
          {knowers.length ? knowers.map((p) => p.label).join(', ') : 'Nobody yet'}
          <span className="text-ink-3">
            {' '}
            · {knowers.length} of {view.people.length}
          </span>
        </p>
      </div>
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
  const [asOf, setAsOf] = useState<number | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const booted = useRef(false)

  const run = useCallback(async (fn: () => Promise<Snapshot>, again?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      const s = await fn()
      setSnap(s)
      setRetry(null)
      // New entries move the shift views back to "now".
      setAsOf(null)
      setFocus(null)
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
          {view.now && <span className="ml-3 inline-block rounded-md border border-line-strong px-2 py-0.5 align-middle font-mono text-[14px] font-medium text-ink-2 tabular-nums">{view.now.label}</span>}
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

      <div className={`grid gap-5 ${view.phase === 'complete' ? '' : 'lg:grid-cols-[280px_minmax(0,1fr)]'}`}>
        {view.phase !== 'complete' && (
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <ResidentCard view={view} />
          </aside>
        )}

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
              <section className="card p-4 sm:p-5" aria-labelledby="shift-title">
                <h2 id="shift-title" className="mb-3 text-[18px]">
                  Shift timeline
                </h2>
                <ShiftTimeline view={view} asOf={asOf} onAsOf={setAsOf} focus={focus} onFocus={setFocus} />
              </section>
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div className="min-w-0">
                  <EventTimeline view={view} />
                  {view.canAdvance && <TransportBar view={view} onNext={next} busy={busy} />}
                </div>
                <div className="min-w-0 space-y-5 xl:sticky xl:top-4">
                  {view.phase === 'decision' && view.decision ? (
                    <DecisionPanel key={view.decision.id} decision={view.decision} evidenceCount={events} busy={busy} onSubmit={decide} />
                  ) : showFeedback ? (
                    <>
                      <FeedbackCard key={view.feedback!.decisionId} feedback={view.feedback!} />
                      <KnownSoFar view={view} />
                    </>
                  ) : (
                    <KnownSoFar view={view} />
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
              <DebriefPanel view={view} busy={busy} onReplay={replay} />
              <section className="card p-4 sm:p-5" aria-labelledby="who-title">
                <h2 id="who-title" className="text-[18px]">
                  Who knew, and when
                </h2>
                <p className="mb-3 text-[13px] text-ink-3">Drag the cursor, or select a decision marker to see the entries it was scored on.</p>
                <ShiftTimeline view={view} asOf={asOf} onAsOf={setAsOf} focus={focus} onFocus={setFocus} />
              </section>
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
      <p className="text-[12.5px] text-ink-3">From {h.startedFrom === 'gemini' ? 'an AI draft' : h.startedFrom === 'template' ? 'the template' : 'scratch'}, as submitted</p>
      <dl className="mt-3 space-y-2 text-[14px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[24px_1fr] gap-3">
            <dt className="font-mono text-[13px] font-semibold text-ink-3">{k}</dt>
            <dd className="whitespace-pre-line">{v || <span className="text-ink-3 italic">(empty)</span>}</dd>
          </div>
        ))}
        {h.draft.unknowns.length > 0 && (
          <div className="grid grid-cols-[24px_1fr] gap-3">
            <dt className="font-mono text-[13px] font-semibold text-unknown">?</dt>
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
