/** Semantic tone for a score: good (80%+), mid (50%+), poor. */
export function toneOf(earned: number, max: number) {
  const p = max ? earned / max : 0
  return p >= 0.8 ? 'good' : p >= 0.5 ? 'mid' : 'poor'
}
