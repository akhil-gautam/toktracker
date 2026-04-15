import type { Rule } from '../types.js'

export const d14AbandonedSession: Rule = {
  id: 'D14_abandoned_session',
  category: 'D',
  triggers: ['Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_age_days: 7, min_cents: 25 },
  evaluate(ctx) {
    const cutoff = ctx.now() - ctx.thresholds.min_age_days * 24 * 60 * 60 * 1000
    const rows = ctx.db.prepare(`
      SELECT s.id, s.cost_millicents FROM sessions s
      LEFT JOIN pr_attributions pa ON pa.session_id = s.id
      LEFT JOIN git_events g ON g.repo = s.git_repo AND g.branch = s.git_branch AND g.kind IN ('commit','pr_merged','pr_opened')
      WHERE s.started_at < ? AND pa.session_id IS NULL AND g.id IS NULL
    `).all(cutoff) as Array<{ id: string; cost_millicents: number }>
    const qualifying = rows.filter(r => r.cost_millicents >= ctx.thresholds.min_cents * 10)
    if (qualifying.length === 0) return null
    const totalCents = Math.round(qualifying.reduce((s, r) => s + r.cost_millicents, 0) / 10)
    return {
      ruleId: 'D14_abandoned_session',
      severity: 'info',
      summary: `${qualifying.length} likely-abandoned sessions totalling ~$${(totalCents / 100).toFixed(2)}`,
      metadata: { sessionIds: qualifying.map(r => r.id), totalCents },
    }
  },
}
