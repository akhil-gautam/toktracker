export function hashSimilarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 && tb.size === 0) return 1
  const union = new Set([...ta, ...tb])
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / union.size
}

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3),
  )
}
