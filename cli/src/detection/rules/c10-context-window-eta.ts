import type { Rule } from '../types.js'

const CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus': 200_000,
  'claude-sonnet': 200_000,
  'claude-haiku': 200_000,
  'gpt': 128_000,
  'gemini': 1_000_000,
}

function limitFor(model: string): number {
  const lower = model.toLowerCase()
  for (const k of Object.keys(CONTEXT_LIMITS)) if (lower.includes(k)) return CONTEXT_LIMITS[k]
  return 200_000
}

export const c10ContextWindowEta: Rule = {
  id: 'C10_context_window_eta',
  category: 'C',
  triggers: ['UserPromptSubmit'],
  defaultSeverity: 'warn',
  hardBlockEligible: false,
  defaultThresholds: { warn_turns: 10 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const session = ctx.db.prepare('SELECT model FROM sessions WHERE id = ?').get(ctx.sessionId) as { model: string } | undefined
    if (!session) return null
    const row = ctx.db.prepare(`
      SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as used, COUNT(*) as turns
      FROM messages WHERE session_id = ? AND role = 'assistant'
    `).get(ctx.sessionId) as { used: number; turns: number }
    if (row.turns < 2) return null
    const ceiling = limitFor(session.model)
    const avgPerTurn = row.used / row.turns
    const remaining = Math.max(ceiling - row.used, 0)
    const etaTurns = avgPerTurn > 0 ? Math.floor(remaining / avgPerTurn) : Infinity
    if (etaTurns > ctx.thresholds.warn_turns) return null
    return {
      ruleId: 'C10_context_window_eta',
      severity: 'warn',
      summary: `context projected to hit ${ceiling.toLocaleString()} in ~${etaTurns} turns (using ${row.used.toLocaleString()} / ${ceiling.toLocaleString()})`,
      metadata: { etaTurns, used: row.used, ceiling, avgPerTurn },
      suggestedAction: { kind: 'compact', payload: {} },
    }
  },
}
