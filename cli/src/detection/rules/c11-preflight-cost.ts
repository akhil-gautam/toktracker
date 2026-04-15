import type { Rule } from '../types.js'

const RATES: Record<string, { in: number; out: number }> = {
  'claude-opus': { in: 15, out: 75 },
  'claude-sonnet': { in: 3, out: 15 },
  'claude-haiku': { in: 0.8, out: 4 },
  'gpt-5': { in: 5, out: 20 },
  'gemini': { in: 1, out: 3 },
}

function rateFor(model: string): { in: number; out: number } {
  const lower = model.toLowerCase()
  for (const k of Object.keys(RATES)) if (lower.includes(k)) return RATES[k]
  return RATES['claude-sonnet']
}

export const c11PreflightCost: Rule = {
  id: 'C11_preflight_cost',
  category: 'C',
  triggers: ['UserPromptSubmit'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_cost_cents: 1 },
  evaluate(ctx) {
    if (!ctx.sessionId || !ctx.userPrompt) return null
    const session = ctx.db.prepare('SELECT model FROM sessions WHERE id = ?').get(ctx.sessionId) as { model: string } | undefined
    if (!session) return null
    const avgRow = ctx.db.prepare(`
      SELECT COALESCE(AVG(input_tokens), 0) as ai, COALESCE(AVG(output_tokens), 0) as ao
      FROM messages WHERE session_id = ? AND role = 'assistant'
    `).get(ctx.sessionId) as { ai: number; ao: number }
    const promptTokens = Math.ceil((ctx.userPrompt.length || 0) / 4)
    const estInputLow  = promptTokens + avgRow.ai * 0.7
    const estInputHigh = promptTokens + avgRow.ai * 1.3
    const estOutputLow  = avgRow.ao * 0.5
    const estOutputHigh = avgRow.ao * 1.5
    const rate = rateFor(session.model)
    const lowDollars  = (estInputLow  * rate.in + estOutputLow  * rate.out) / 1_000_000
    const highDollars = (estInputHigh * rate.in + estOutputHigh * rate.out) / 1_000_000
    const lowCents = Math.round(lowDollars * 100)
    const highCents = Math.round(highDollars * 100)
    if (highCents < ctx.thresholds.min_cost_cents) return null
    return {
      ruleId: 'C11_preflight_cost',
      severity: 'info',
      summary: `estimated turn cost: $${(lowCents / 100).toFixed(2)}–$${(highCents / 100).toFixed(2)}`,
      metadata: { estLowCents: lowCents, estHighCents: highCents, model: session.model },
    }
  },
}
