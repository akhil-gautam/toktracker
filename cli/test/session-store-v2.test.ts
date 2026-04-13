import { describe, it, expect } from 'vitest'
import { SessionStore } from '../src/services/session-store.js'
import type { Session } from '../src/types.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tool: 'claude_code', model: 'claude-sonnet-4-6', provider: 'anthropic',
    inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500,
    cacheWriteTokens: 0, reasoningTokens: 0, costMillicents: 5000,
    startedAt: new Date(), ...overrides,
  }
}

describe('SessionStore v2 methods', () => {
  it('getActiveTools returns tools with sessions today', () => {
    const store = new SessionStore()
    store.addSessions([
      makeSession({ tool: 'claude_code' }),
      makeSession({ tool: 'codex' }),
      makeSession({ tool: 'claude_code' }),
    ])
    const tools = store.getActiveTools()
    expect(tools).toContain('claude_code')
    expect(tools).toContain('codex')
    expect(tools).toHaveLength(2)
  })

  it('getTopRepo returns repo with highest cost today', () => {
    const store = new SessionStore()
    store.addSessions([
      makeSession({ gitRepo: 'user/a', costMillicents: 3000 }),
      makeSession({ gitRepo: 'user/b', costMillicents: 8000 }),
      makeSession({ gitRepo: 'user/a', costMillicents: 2000 }),
    ])
    const top = store.getTopRepo()
    expect(top?.repo).toBe('user/b')
  })

  it('getModelTrends returns per-model 7-day cost arrays', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      makeSession({ model: 'claude-opus-4-6', costMillicents: 5000, startedAt: today }),
    ])
    const trends = store.getModelTrends()
    expect(trends['claude-opus-4-6']).toBeDefined()
    expect(trends['claude-opus-4-6'].length).toBe(7)
  })

  it('getDailyStats returns stats for arbitrary day range', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([makeSession({ costMillicents: 5000, startedAt: today })])
    const stats = store.getDailyStats(14)
    expect(stats.length).toBe(14)
  })

  it('getWeekOverWeekDelta returns percentage change', () => {
    const store = new SessionStore()
    const today = new Date()
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 8)
    store.addSessions([
      makeSession({ costMillicents: 10000, startedAt: today }),
      makeSession({ costMillicents: 5000, startedAt: lastWeek }),
    ])
    const delta = store.getWeekOverWeekDelta()
    // This week: 10000, last week: 5000 → +100%
    expect(delta).toBeGreaterThan(0)
  })
})
