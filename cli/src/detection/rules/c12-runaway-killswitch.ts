import type { Rule } from '../types.js'

export const c12RunawayKillswitch: Rule = {
  id: 'C12_runaway_killswitch',
  category: 'C',
  triggers: ['PreToolUse'],
  defaultSeverity: 'block',
  hardBlockEligible: true,
  defaultThresholds: { ceiling_cents: 2000 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const row = ctx.db.prepare('SELECT cost_millicents FROM sessions WHERE id = ?').get(ctx.sessionId) as { cost_millicents: number } | undefined
    if (!row) return null
    const cents = Math.round(row.cost_millicents / 10)
    if (cents < ctx.thresholds.ceiling_cents) return null
    return {
      ruleId: 'C12_runaway_killswitch',
      severity: 'block',
      summary: `session cost $${(cents / 100).toFixed(2)} exceeds ceiling $${(ctx.thresholds.ceiling_cents / 100).toFixed(2)}`,
      metadata: { cents, ceiling: ctx.thresholds.ceiling_cents },
    }
  },
}
