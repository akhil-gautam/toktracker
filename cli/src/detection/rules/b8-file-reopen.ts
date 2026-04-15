import type { Rule } from '../types.js'
import { ToolCallsRepo } from '../../db/repository.js'
import { extractTargetPath } from '../../capture/hashing.js'

export const b8FileReopen: Rule = {
  id: 'B8_file_reopen',
  category: 'B',
  triggers: ['PostToolUse'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_sessions: 5, window_days: 14 },
  evaluate(ctx) {
    if (!ctx.toolName || !ctx.toolInput) return null
    const path = extractTargetPath(ctx.toolName, ctx.toolInput)
    if (!path) return null
    const since = ctx.now() - ctx.thresholds.window_days * 24 * 60 * 60 * 1000
    const count = new ToolCallsRepo(ctx.db).countDistinctSessionsForPath(path, since)
    if (count < ctx.thresholds.min_sessions) return null
    return {
      ruleId: 'B8_file_reopen',
      severity: 'info',
      summary: `${path} has been opened in ${count} distinct sessions — consider adding to CLAUDE.md`,
      metadata: { path, sessions: count },
      suggestedAction: { kind: 'claude_md_edit', payload: { path, sessions: count } },
    }
  },
}
