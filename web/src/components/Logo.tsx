/** A thread with three knots: observations tied together across shifts. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" fill="none">
      <path
        d="M4 30 C 10 6, 16 34, 22 18 S 32 4, 36 12"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="9.5" cy="19" r="3.4" fill="var(--color-paper)" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="22" cy="18" r="3.4" fill="var(--color-persistent)" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="33" cy="8.5" r="3.4" fill="var(--color-paper)" stroke="currentColor" strokeWidth="2.2" strokeDasharray="2.4 2" />
    </svg>
  )
}
