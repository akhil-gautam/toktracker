import type { Rule } from '../types.js'

interface Ratio { session: string; ratio: number }

function sessionRatio(db: any, sessionId: string): Ratio {
  const row = db.prepare(`
    SELECT COALESCE(SUM(cache_read), 0) as cache, COALESCE(SUM(input_tokens), 0) as input
    FROM messages WHERE session_id = ?
  `).get(sessionId) as { cache: number; input: number }
  const ratio = row.input > 0 ? row.cache / row.input : 0
  return { session: sessionId, ratio }
}

export const a3CacheMissPostmortem: Rule = {
  id: 'A3_cache_miss_postmortem',
  category: 'A',
  triggers: ['PostToolUse', 'Stop'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_drop_pct: 40, baseline_sessions: 5 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const current = sessionRatio(ctx.db, ctx.sessionId)
    const baselineSessions = ctx.thresholds.baseline_sessions ?? 5
    const baselineRows = ctx.db.prepare(`
      SELECT id FROM sessions WHERE id != ? ORDER BY started_at DESC LIMIT ?
    `).all(ctx.sessionId, baselineSessions) as { id: string }[]
    if (baselineRows.length === 0) return null
    const avg = baselineRows.reduce((sum, r) => sum + sessionRatio(ctx.db, r.id).ratio, 0) / baselineRows.length
    const dropPct = (avg - current.ratio) * 100
    if (dropPct < ctx.thresholds.min_drop_pct) return null
    return {
      ruleId: 'A3_cache_miss_postmortem',
      severity: 'info',
      summary: `cache hit ratio dropped from ${Math.round(avg * 100)}% baseline to ${Math.round(current.ratio * 100)}% this session`,
      metadata: { baselineRatio: avg, currentRatio: current.ratio, dropPct },
    }
  },
}
