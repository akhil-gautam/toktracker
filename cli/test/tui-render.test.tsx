import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { SessionStore } from '../src/services/session-store.js'
import { ActivityHero } from '../src/components/ActivityHero.js'
import { HeroMetrics } from '../src/components/HeroMetrics.js'
import { OverviewTab } from '../src/components/OverviewTab.js'
import { checkBudgets } from '../src/hooks/useBudget.js'
import type { Session } from '../src/types.js'

function mkSession(o: Partial<Session>): Session {
  return {
    id: Math.random().toString(36).slice(2),
    tool: 'claude_code', model: 'claude-opus-4-8', provider: 'anthropic',
    inputTokens: 1000, outputTokens: 500, cacheReadTokens: 2000, cacheWriteTokens: 100,
    reasoningTokens: 0, costMillicents: 5000, startedAt: new Date(), ...o,
  }
}

describe('TUI rendering (store-backed, post split-brain fix)', () => {
  it('ActivityHero shows real data with no label/value overlap', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      mkSession({ startedAt: today, costMillicents: 22_000_000 }),
      mkSession({ startedAt: today, model: 'gpt-5', costMillicents: 1000 }),
      mkSession({ startedAt: new Date(today.getTime() - 86_400_000), costMillicents: 5000 }),
    ])
    const f = render(<ActivityHero store={store} columns={120} />).lastFrame()!
    // eslint-disable-next-line no-console
    console.log('\n--- ActivityHero ---\n' + f)
    expect(f).toContain('SESSIONS')
    expect(f).toContain('TOTAL TOKENS')
    expect(f).not.toMatch(/\dESSIONS/)        // value not glued onto the label
    expect(f).not.toMatch(/\dCTIVE/)          // "0CTIVE DAYS" overlap gone
    expect(f).toMatch(/SESSIONS[\s\S]*\b3\b/) // the real session count (3) renders
  })

  it('Overview shows a forward-looking projection, and a budget pace when over', () => {
    const store = new SessionStore()
    const today = new Date()
    // Spend today so this month has a non-zero run rate.
    store.addSessions([
      mkSession({ startedAt: today, costMillicents: 5_000_000 }),
      mkSession({ startedAt: today, costMillicents: 5_000_000 }),
    ])
    // A tiny daily budget so the pace line trips "over".
    const budgetResults = checkBudgets(
      [{ id: 'global-daily', scope: 'global', period: 'daily', limitCents: 100, alertAtPct: 80 }],
      store.getAllSessions(),
    )
    const f = render(<OverviewTab store={store} budgetResults={budgetResults} db={null as any} columns={120} />).lastFrame()!
    expect(f).toMatch(/this month/)
    expect(f).toMatch(/projected/)
    expect(f).toMatch(/over budget|on pace to hit/) // budget pace surfaced on the overview
  })

  it('HeroMetrics renders all-time card values, not blanks', () => {
    const store = new SessionStore()
    store.addSessions([mkSession({ costMillicents: 404_600_000 })]) // $4046
    const f = render(<HeroMetrics store={store} budgetResults={[]} columns={80} />).lastFrame()!
    // eslint-disable-next-line no-console
    console.log('\n--- HeroMetrics ---\n' + f)
    expect(f).toContain('TOTAL SPEND')
    expect(f).toContain('TOTAL SESSIONS')
    expect(f).toMatch(/\$4046|\$404[0-9]/) // the all-time spend value actually renders
  })
})
