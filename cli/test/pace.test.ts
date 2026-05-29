import { describe, it, expect } from 'vitest'
import { projectBudget, projectSpend } from '../src/services/pace.js'
import type { BudgetResult } from '../src/hooks/useBudget.js'

function result(over: Partial<BudgetResult['budget']> & { spentCents: number }): BudgetResult {
  const { spentCents, ...b } = over
  const budget = { id: 'b', scope: 'global' as const, period: 'daily' as const, limitCents: 1000, alertAtPct: 80, ...b }
  const pct = budget.limitCents > 0 ? Math.round((spentCents / budget.limitCents) * 100) : 0
  return { budget, spentCents, pct, alert: pct >= budget.alertAtPct }
}

describe('projectBudget', () => {
  it('projects an over-pace daily budget and predicts a breach within the period', () => {
    // Daily $10 budget; by 6am (25% of day) already spent $5 → on pace for ~$20
    const now = new Date('2026-05-29T06:00:00')
    const p = projectBudget(result({ period: 'daily', limitCents: 1000, spentCents: 500 }), now)
    expect(p.elapsedPct).toBe(25)
    expect(p.projectedEndCents).toBe(2000)   // 500 / 0.25
    expect(p.projectedPct).toBe(200)
    expect(p.status).toBe('over')
    expect(p.breachAt).not.toBeNull()        // will cross $10 later today
    expect(p.summary).toMatch(/on pace to hit/)
  })

  it('reports on-track when projected to stay under', () => {
    // Half the day elapsed, only $3 of $10 spent → projected $6
    const now = new Date('2026-05-29T12:00:00')
    const p = projectBudget(result({ period: 'daily', limitCents: 1000, spentCents: 300 }), now)
    expect(p.projectedEndCents).toBe(600)
    expect(p.status).toBe('under')
    expect(p.breachAt).toBeNull()
    expect(p.summary).toMatch(/on track/)
  })

  it('reports over budget when already past the limit', () => {
    const now = new Date('2026-05-29T18:00:00')
    const p = projectBudget(result({ period: 'daily', limitCents: 1000, spentCents: 1500 }), now)
    expect(p.status).toBe('over')
    expect(p.summary).toMatch(/over budget/)
  })
})

describe('projectSpend (budget-independent)', () => {
  it('projects month-end spend from the run rate so far', () => {
    // June has 30 days; on the 15th end-of-day = 15/30 = 50% elapsed, $300 spent → $600
    const now = new Date('2026-06-15T23:59:59')
    const p = projectSpend(30000, 'monthly', now) // $300 in cents
    expect(p.elapsedPct).toBeGreaterThanOrEqual(46)
    expect(p.elapsedPct).toBeLessThanOrEqual(50)
    expect(p.projectedEndCents).toBeGreaterThan(58000)
    expect(p.projectedEndCents).toBeLessThan(66000)
  })
})
