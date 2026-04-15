import type { Rule } from '../types.js'

export const b9PromptPattern: Rule = {
  id: 'B9_prompt_pattern',
  category: 'B',
  triggers: ['Stop', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_occurrences: 5, min_prefix_tokens: 5 },
  evaluate(ctx) {
    const rows = ctx.db.prepare(
      `SELECT content_redacted FROM messages WHERE role = 'user' AND content_redacted IS NOT NULL
       ORDER BY created_at DESC LIMIT 1000`
    ).all() as { content_redacted: string }[]
    const counts = new Map<string, number>()
    for (const r of rows) {
      const tokens = r.content_redacted.trim().split(/\s+/).slice(0, 12)
      if (tokens.length < ctx.thresholds.min_prefix_tokens) continue
      const normalized = tokens.map(t => t.replace(/\d+/g, 'N'))
      const prefix = normalized.slice(0, ctx.thresholds.min_prefix_tokens).join(' ').toLowerCase()
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
    }
    let best: { prefix: string; count: number } | null = null
    for (const [prefix, count] of counts) {
      if (count >= ctx.thresholds.min_occurrences && (!best || count > best.count)) best = { prefix, count }
    }
    if (!best) return null
    return {
      ruleId: 'B9_prompt_pattern',
      severity: 'info',
      summary: `pattern "${best.prefix}…" used ${best.count}× — save as slash command?`,
      metadata: { prefix: best.prefix, count: best.count },
      suggestedAction: { kind: 'save_command', payload: { prefix: best.prefix } },
    }
  },
}
