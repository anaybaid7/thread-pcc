'use client'

import { handover, relay, when } from '@thread/engine'
import Link from 'next/link'
import { RelayHeader, RelayRow } from '@/components/Relay'
import { useDemo } from '@/lib/demo'
import { useWard } from '@/lib/ward'

const ROLES = [
  { href: '/spot/', n: 1, who: 'Maya, PSW', what: 'Spot it', line: 'Check a resident against their own usual. Send what’s different.' },
  { href: '/size/', n: 2, who: 'Priya, charge nurse', what: 'Size it up', line: 'See who first and why. Check, then watch or escalate.' },
  { href: '/handover/', n: 3, who: 'Daniel, evening nurse', what: 'Carry it forward', line: 'Take on every open item at the shift change.' },
]

export default function Home() {
  const { ward } = useWard()
  const demo = useDemo()
  const lanes = relay(ward!)
  const held = lanes.filter((l) => l.stuck)
  const h = handover(ward!)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div>
          <p className="label">Birch wing · {when(ward!.now)}</p>
          <h1 className="mt-0.5 text-[26px]">Catch it early. Then don’t drop it.</h1>
          <p className="mt-1 max-w-[70ch] text-ink-2">
            Early signs of decline are usually noticed by someone, then lost between people. Each row below is one concern, followed from the person who
            noticed it to a recorded outcome.
          </p>
        </div>
        <dl className="flex gap-6 text-[13px]">
          <div>
            <dt className="label">Held up</dt>
            <dd className="font-mono text-[22px] font-medium text-poor">{held.length}</dd>
          </div>
          <div>
            <dt className="label">Open</dt>
            <dd className="font-mono text-[22px] font-medium">{lanes.filter((l) => !l.closed).length}</dd>
          </div>
          <div>
            <dt className="label">Next handover</dt>
            <dd className="font-mono text-[22px] font-medium">{h.label.slice(4)}</dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="relay" className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
          <h2 id="relay" className="text-[15px]">
            The relay
          </h2>
          <p className="text-[12.5px] text-ink-3">
            <span className="mr-1 inline-block size-2 rounded-full bg-poor align-middle" /> held here
            <span className="mr-1 ml-4 inline-block size-2 rounded-full border-2 border-dashed border-mid align-middle" /> should have happened
            <span className="mr-1 ml-4 inline-block size-2 rounded-full bg-ink align-middle" /> done
          </p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[840px]">
            <RelayHeader />
            <ul>
              {lanes.map((l) => (
                <RelayRow key={l.key} lane={l} />
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-label="Workflows" className="grid gap-px border border-line bg-line md:grid-cols-3">
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href} className="group bg-surface px-4 py-3 hover:bg-sunken">
            <p className="label">
              <span className="font-mono">{r.n}</span> · {r.who}
            </p>
            <p className="mt-0.5 text-[16px] font-semibold group-hover:underline">{r.what}</p>
            <p className="text-[13px] text-ink-2">{r.line}</p>
          </Link>
        ))}
      </section>
      {!demo.running && (
        <p className="text-[13px] text-ink-3">
          New here? <button type="button" className="link" onClick={() => void demo.start()}>Play the demo</button> runs all three workflows by itself, with captions, in about two minutes.
        </p>
      )}
    </div>
  )
}
