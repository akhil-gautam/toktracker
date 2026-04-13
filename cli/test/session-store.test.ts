import { describe, it, expect } from 'vitest'
import { SessionStore } from '../src/services/session-store.js'
import type { Session } from '../src/types.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tool: 'claude_code', model: 'claude-sonnet-4-6', provider: 'anthropic',
    inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500,
    cacheWriteTokens: 0, reasoningTokens: 0, costMillicents: 5000,
    startedAt: new Date('2026-04-13T10:00:00Z'), ...overrides,
  }
}

describe('SessionStore', () => {
  it('deduplicates by id', () => {
    const store = new SessionStore()
    const s = makeSession({ id: 'dup-1' })
    store.addSessions([s, s])
    expect(store.getAllSessions()).toHaveLength(1)
  })

  it('computes today stats', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([makeSession({ costMillicents: 3000, startedAt: today }), makeSession({ costMillicents: 7000, startedAt: today })])
    const stats = store.getTodayStats()
    expect(stats.costMillicents).toBe(10000)
    expect(stats.sessionCount).toBe(2)
  })

  it('computes stats by model', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      makeSession({ model: 'claude-opus-4-6', costMillicents: 8000, startedAt: today }),
      makeSession({ model: 'claude-sonnet-4-6', costMillicents: 3000, startedAt: today }),
      makeSession({ model: 'claude-opus-4-6', costMillicents: 2000, startedAt: today }),
    ])
    const opus = store.getModelStats().find(m => m.model === 'claude-opus-4-6')
    expect(opus?.costMillicents).toBe(10000)
    expect(opus?.sessionCount).toBe(2)
  })

  it('computes stats by tool', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([makeSession({ tool: 'claude_code', costMillicents: 5000, startedAt: today }), makeSession({ tool: 'codex', costMillicents: 3000, startedAt: today })])
    expect(store.getToolStats()).toHaveLength(2)
    expect(store.getToolStats().find(t => t.tool === 'codex')?.costMillicents).toBe(3000)
  })

  it('computes week stats', () => {
    const store = new SessionStore()
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      store.addSessions([makeSession({ costMillicents: 1000 * (i + 1), startedAt: d })])
    }
    const week = store.getWeekStats()
    expect(week.length).toBe(7)
    expect(week.reduce((s, d) => s + d.costMillicents, 0)).toBe(28000)
  })

  it('computes repo stats', () => {
    const store = new SessionStore()
    store.addSessions([
      makeSession({ gitRepo: 'user/repo-a', costMillicents: 5000 }),
      makeSession({ gitRepo: 'user/repo-a', costMillicents: 3000 }),
      makeSession({ gitRepo: 'user/repo-b', costMillicents: 2000 }),
    ])
    expect(store.getRepoStats()).toHaveLength(2)
    expect(store.getRepoStats().find(r => r.repo === 'user/repo-a')?.costMillicents).toBe(8000)
  })

  it('returns week cost total', () => {
    const store = new SessionStore()
    store.addSessions([makeSession({ costMillicents: 5000, startedAt: new Date() })])
    expect(store.getWeekTotal()).toBe(5000)
  })
})
