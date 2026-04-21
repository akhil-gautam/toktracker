import type { Rule } from '../types.js'

// Correction cues the rule looks for at the start of a clause. Keeping the
// set small avoids false positives from prose that merely contains "actually".
const CUES = [
  "don't ",
  'do not ',
  'stop ',
  'no, ',
  'no.',
  'not that',
  'i said ',
  "we don't ",
  'we do not ',
  "please don't ",
  'actually, ',
]

const STOPS = new Set<string>(['.', '!', '?', '\n', ',', ';'])

/// Extract the first-clause correction phrase so "don't mock the db, it hides
/// migration bugs" normalizes to "don't mock the db". Returns null if no cue
/// matches in the content.
export function extractCorrection(content: string): string | null {
  const lower = content.toLowerCase()
  let earliest = -1
  for (const cue of CUES) {
    const idx = lower.indexOf(cue)
    if (idx >= 0 && (earliest < 0 || idx < earliest)) earliest = idx
  }
  if (earliest < 0) return null
  const tail = lower.slice(earliest)
  let end = tail.length
  for (let i = 1; i < tail.length; i++) {
    if (STOPS.has(tail[i]!)) { end = i; break }
  }
  let phrase = tail.slice(0, end).trim()
  if (phrase.length > 48) phrase = phrase.slice(0, 48)
  return phrase.length > 0 ? phrase : null
}

export const b7CorrectionGraph: Rule = {
  id: 'B7_correction_graph',
  category: 'B',
  triggers: ['Stop', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_count: 3, min_sessions: 2, window_days: 30 },
  evaluate(ctx) {
    const windowMs = (ctx.thresholds.window_days ?? 30) * 86_400_000
    const cutoff = ctx.now() - windowMs
    const rows = ctx.db.prepare(`
      SELECT session_id, content_redacted FROM messages
      WHERE role = 'user' AND created_at >= ?
    `).all(cutoff) as Array<{ session_id: string; content_redacted: string | null }>
    const counts = new Map<string, number>()
    const sessions = new Map<string, Set<string>>()
    for (const r of rows) {
      if (!r.content_redacted) continue
      const phrase = extractCorrection(r.content_redacted)
      if (!phrase) continue
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
      const set = sessions.get(phrase) ?? new Set<string>()
      set.add(r.session_id)
      sessions.set(phrase, set)
    }
    const minCount = ctx.thresholds.min_count ?? 3
    const minSessions = ctx.thresholds.min_sessions ?? 2
    let best: { phrase: string; count: number; sessions: number } | null = null
    for (const [phrase, count] of counts) {
      const sCount = sessions.get(phrase)?.size ?? 0
      if (count < minCount || sCount < minSessions) continue
      if (!best || count > best.count) best = { phrase, count, sessions: sCount }
    }
    if (!best) return null
    return {
      ruleId: 'B7_correction_graph',
      severity: 'info',
      summary: `"${best.phrase}…" said ${best.count}× across ${best.sessions} sessions — consider adding to CLAUDE.md`,
      metadata: { phrase: best.phrase, count: best.count, sessions: best.sessions },
      suggestedAction: { kind: 'claude_md_edit', payload: { phrase: best.phrase, kind: 'correction' } },
    }
  },
}
