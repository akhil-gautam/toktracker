import { describe, it, expect } from 'vitest'
import { checkBudgets } from '../src/hooks/useBudget.js'
import type { Budget, Session } from '../src/types.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tool: 'claude_code', model: 'claude-sonnet-4-6', provider: 'anthropic',
    inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0,
    cacheWriteTokens: 0, reasoningTokens: 0, costMillicents: 5000,
    startedAt: new Date(), ...overrides,
  }
}

describe('checkBudgets', () => {
  it('calculates spend percentage for global daily budget', () => {
    const budgets: Budget[] = [{ id: 'b1', scope: 'global', period: 'daily', limitCents: 100, alertAtPct: 80 }]
    const sessions = [makeSession({ costMillicents: 50_000 })]
    const results = checkBudgets(budgets, sessions)
    expect(results).toHaveLength(1)
    expect(results[0].spentCents).toBe(50)
    expect(results[0].pct).toBe(50)
    expect(results[0].alert).toBe(false)
  })

  it('triggers alert when over threshold', () => {
    const budgets: Budget[] = [{ id: 'b1', scope: 'global', period: 'daily', limitCents: 100, alertAtPct: 80 }]
    const results = checkBudgets(budgets, [makeSession({ costMillicents: 90_000 })])
    expect(results[0].pct).toBe(90)
    expect(results[0].alert).toBe(true)
  })

  it('scopes by repo', () => {
    const budgets: Budget[] = [{ id: 'b1', scope: 'repo', scopeValue: 'user/repo-a', period: 'daily', limitCents: 200, alertAtPct: 80 }]
    const sessions = [
      makeSession({ gitRepo: 'user/repo-a', costMillicents: 100_000 }),
      makeSession({ gitRepo: 'user/repo-b', costMillicents: 50_000 }),
    ]
    expect(checkBudgets(budgets, sessions)[0].spentCents).toBe(100)
  })

  it('handles weekly period', () => {
    const budgets: Budget[] = [{ id: 'b1', scope: 'global', period: 'weekly', limitCents: 1000, alertAtPct: 80 }]
    const now = new Date()
    const twoDaysAgo = new Date(now); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const sessions = [makeSession({ costMillicents: 300_000, startedAt: now }), makeSession({ costMillicents: 200_000, startedAt: twoDaysAgo })]
    expect(checkBudgets(budgets, sessions)[0].spentCents).toBe(500)
  })
})
