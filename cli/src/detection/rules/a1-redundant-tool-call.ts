import { ToolCallsRepo } from '../../db/repository.js'
import { sha256, normalizeArgs } from '../../capture/hashing.js'
import type { Rule } from '../types.js'

export const a1RedundantToolCall: Rule = {
  id: 'A1_redundant_tool_call',
  category: 'A',
  triggers: ['PreToolUse'],
  defaultSeverity: 'warn',
  hardBlockEligible: true,
  defaultThresholds: { min_repeat_count: 2 },
  evaluate(ctx) {
    if (!ctx.sessionId || !ctx.toolName || ctx.toolInput == null) return null
    const argsHash = sha256(normalizeArgs(ctx.toolInput))
    const prior = new ToolCallsRepo(ctx.db).findBySessionToolArgs(ctx.sessionId, ctx.toolName, argsHash)
    const succeeded = prior.filter(p => p.succeeded === 1)
    if (succeeded.length < ctx.thresholds.min_repeat_count - 1) return null
    const turn = prior[0]?.createdAt
    return {
      ruleId: 'A1_redundant_tool_call',
      severity: 'warn',
      summary: `${ctx.toolName} with identical args already succeeded ${succeeded.length}× this session` + (turn ? `; first at ${new Date(turn).toISOString()}` : ''),
      metadata: { argsHash, priorCount: succeeded.length },
      suggestedAction: { kind: 'acknowledge_only', payload: { argsHash } },
    }
  },
}
