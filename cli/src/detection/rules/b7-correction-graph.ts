import type { Rule } from '../types.js'

const PATTERNS = [
  /\bno\s+(don'?t|do not)\b/i,
  /\bstop\s+(doing|using)\b/i,
  /\binstead\s+of\b/i,
  /\bactually\b/i,
  /\bthat'?s\s+wrong\b/i,
  /\bnever\s+(do|use)\b/i,
]

export const b7CorrectionGraph: Rule = {
  id: 'B7_correction_graph',
  category: 'B',
  triggers: ['Stop', 'PostToolUse'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: {},
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const row = ctx.db.prepare(`
      SELECT content_redacted FROM messages WHERE session_id = ? AND role = 'user'
      ORDER BY turn_index DESC LIMIT 1
    `).get(ctx.sessionId) as { content_redacted: string } | undefined
    if (!row?.content_redacted) return null
    if (!PATTERNS.some(p => p.test(row.content_redacted))) return null
    return {
      ruleId: 'B7_correction_graph',
      severity: 'info',
      summary: 'correction detected — candidate for CLAUDE.md rule',
      metadata: { text: row.content_redacted.slice(0, 200) },
      suggestedAction: { kind: 'claude_md_edit', payload: { text: row.content_redacted } },
    }
  },
}
