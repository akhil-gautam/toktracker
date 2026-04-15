import type { Rule } from '../types.js'

const PREMIUM_MODELS = ['claude-opus-4-6', 'claude-opus-4-5', 'claude-opus-4', 'gpt-5', 'o3', 'o1']
const TRIVIAL_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Edit'])

export const a4ModelMismatch: Rule = {
  id: 'A4_model_mismatch',
  category: 'A',
  triggers: ['Stop', 'UserPromptSubmit'],
  defaultSeverity: 'warn',
  hardBlockEligible: true,
  defaultThresholds: { trivial_ratio_pct: 80, min_tool_calls: 10 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const session = ctx.db.prepare('SELECT model FROM sessions WHERE id = ?').get(ctx.sessionId) as { model: string } | undefined
    if (!session || !PREMIUM_MODELS.some(m => session.model.toLowerCase().includes(m))) return null
    const tools = ctx.db.prepare('SELECT tool_name, COUNT(*) as c FROM tool_calls WHERE session_id = ? GROUP BY tool_name').all(ctx.sessionId) as Array<{ tool_name: string; c: number }>
    const total = tools.reduce((s, t) => s + t.c, 0)
    if (total < ctx.thresholds.min_tool_calls) return null
    const trivial = tools.filter(t => TRIVIAL_TOOLS.has(t.tool_name)).reduce((s, t) => s + t.c, 0)
    const ratio = (trivial / total) * 100
    if (ratio < ctx.thresholds.trivial_ratio_pct) return null
    return {
      ruleId: 'A4_model_mismatch',
      severity: 'warn',
      summary: `${Math.round(ratio)}% of tool calls are trivial (${trivial}/${total}) on ${session.model} — Sonnet likely cheaper`,
      metadata: { trivialRatio: ratio, model: session.model, totalCalls: total },
      suggestedAction: { kind: 'switch_model', payload: { suggest: 'claude-sonnet-4-6' } },
    }
  },
}
