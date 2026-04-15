import type { Rule } from '../types.js'
import { ToolCallsRepo } from '../../db/repository.js'

export const a5RetryFailureWaste: Rule = {
  id: 'A5_retry_failure_waste',
  category: 'A',
  triggers: ['PostToolUse', 'Stop'],
  defaultSeverity: 'warn',
  hardBlockEligible: false,
  defaultThresholds: { min_failed_calls: 3, tokens_floor: 500 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const repo = new ToolCallsRepo(ctx.db)
    const failed = repo.failedCountInSession(ctx.sessionId)
    if (failed < ctx.thresholds.min_failed_calls) return null
    const tokens = (ctx.db.prepare('SELECT COALESCE(SUM(tokens_returned), 0) as t FROM tool_calls WHERE session_id = ? AND succeeded = 0').get(ctx.sessionId) as { t: number }).t
    if (tokens < ctx.thresholds.tokens_floor) return null
    return {
      ruleId: 'A5_retry_failure_waste',
      severity: 'warn',
      summary: `spent ${tokens} tokens on ${failed} failed tool calls this session`,
      metadata: { failedCalls: failed, tokensBurned: tokens },
    }
  },
}
