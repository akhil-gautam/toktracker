import type { Rule } from '../types.js'
import { MessagesRepo } from '../../db/repository.js'
import { sha256 } from '../../capture/hashing.js'

export const b6RepeatQuestion: Rule = {
  id: 'B6_repeat_question',
  category: 'B',
  triggers: ['UserPromptSubmit', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_matches: 3, window_days: 90 },
  evaluate(ctx) {
    if (!ctx.userPrompt || ctx.userPrompt.length < 10) return null
    const hash = sha256(ctx.userPrompt)
    const since = ctx.now() - ctx.thresholds.window_days * 24 * 60 * 60 * 1000
    const count = new MessagesRepo(ctx.db).countByHashSince(hash, since)
    if (count < ctx.thresholds.min_matches) return null
    const sample = ctx.db.prepare(
      `SELECT content_redacted FROM messages WHERE content_hash = ? AND content_redacted IS NOT NULL LIMIT 1`
    ).get(hash) as { content_redacted: string } | undefined
    return {
      ruleId: 'B6_repeat_question',
      severity: 'info',
      summary: `you've asked this same question ${count}× in the last ${ctx.thresholds.window_days} days — add answer to CLAUDE.md?`,
      metadata: { count, hash },
      suggestedAction: {
        kind: 'claude_md_edit',
        payload: { question: sample?.content_redacted ?? '', hash },
      },
    }
  },
}
