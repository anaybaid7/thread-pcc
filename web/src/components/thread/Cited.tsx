/** Citation chips: hovering one lights up the evidence card it points at. */
export function CiteChips({ ids, labels, onFocus }: { ids: string[]; labels: Record<string, string>; onFocus: (ids: string[]) => void }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
      {ids.map((id) => (
        <a
          key={id}
          href={`#ev-${labels[id]}`}
          className="rounded border-[1.5px] border-ink px-1 text-[12px] leading-[18px] font-bold no-underline hover:bg-sticky focus:bg-sticky"
          onMouseEnter={() => onFocus([id])}
          onMouseLeave={() => onFocus([])}
          onFocus={() => onFocus([id])}
          onBlur={() => onFocus([])}
          aria-label={`Evidence ${labels[id]}`}
        >
          {labels[id]}
        </a>
      ))}
    </span>
  )
}
