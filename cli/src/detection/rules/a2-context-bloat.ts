import type { Rule } from '../types.js'

export const a2ContextBloat: Rule = {
  id: 'A2_context_bloat',
  category: 'A',
  triggers: ['UserPromptSubmit'],
  defaultSeverity: 'warn',
  hardBlockEligible: false,
  defaultThresholds: { window_turns: 5, ceiling_tokens: 40000 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const rows = ctx.db.prepare(
      `SELECT COALESCE(SUM(output_tokens), 0) as total
       FROM (SELECT output_tokens FROM messages
             WHERE session_id = ? AND role = 'assistant'
             ORDER BY turn_index DESC LIMIT ?)`
    ).get(ctx.sessionId, ctx.thresholds.window_turns) as { total: number }
    if (rows.total < ctx.thresholds.ceiling_tokens) return null
    return {
      ruleId: 'A2_context_bloat',
      severity: 'warn',
      summary: `last ${ctx.thresholds.window_turns} turns added ${rows.total} tokens — consider /compact`,
      metadata: { windowTokens: rows.total, windowTurns: ctx.thresholds.window_turns },
      suggestedAction: { kind: 'compact', payload: {} },
    }
  },
}
