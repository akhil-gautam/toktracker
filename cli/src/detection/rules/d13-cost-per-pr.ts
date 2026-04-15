import type { Rule } from '../types.js'
import { PrAttributionsRepo } from '../../db/repository.js'

export const d13CostPerPr: Rule = {
  id: 'D13_cost_per_pr',
  category: 'D',
  triggers: ['GitEvent', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_cents: 10 },
  evaluate(ctx) {
    const row = ctx.db.prepare(
      `SELECT repo, pr_number FROM git_events WHERE kind = 'pr_merged' ORDER BY created_at DESC LIMIT 1`
    ).get() as { repo: string; pr_number: number } | undefined
    if (!row) return null
    const attrs = new PrAttributionsRepo(ctx.db).findByPr(row.repo, row.pr_number)
    if (attrs.length === 0) return null
    const cents = new PrAttributionsRepo(ctx.db).totalCostCentsForPr(row.repo, row.pr_number)
    if (cents < ctx.thresholds.min_cents) return null
    return {
      ruleId: 'D13_cost_per_pr',
      severity: 'info',
      summary: `PR #${row.pr_number} in ${row.repo} = ~$${(cents / 100).toFixed(2)} across ${attrs.length} sessions`,
      metadata: { repo: row.repo, prNumber: row.pr_number, cents, sessions: attrs.length },
    }
  },
}
