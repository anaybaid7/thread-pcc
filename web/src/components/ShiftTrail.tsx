/** The shifts a thread crosses, drawn as a short thread with a knot per shift. */
export function ShiftTrail({ shifts }: { shifts: string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-y-1 text-[13px] text-ink-2" aria-label="Shifts this concern crosses">
      {shifts.map((s, i) => (
        <li key={s} className="flex items-center">
          {i > 0 && (
            <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true" className="mx-0.5">
              <path d="M1 4 C 6 1, 10 7, 15 4 S 20 2, 21 4" stroke="currentColor" strokeWidth="1.6" fill="none" />
            </svg>
          )}
          <span className="whitespace-nowrap">{s}</span>
        </li>
      ))}
    </ol>
  )
}
