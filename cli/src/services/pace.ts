import type { BudgetResult } from '../hooks/useBudget.js'

// Forward-looking budget projection — pure, local, no network. Given how much of
// the current period has elapsed and what's been spent, projects end-of-period
// spend at the current run rate and estimates when (if) the limit will be crossed.
// Inspired by CodexBar's UsagePace "runs out in X".

export interface BudgetPace {
  elapsedPct: number          // % of the period elapsed
  projectedEndCents: number   // spend projected to the end of the period at current rate
  projectedPct: number        // projectedEnd / limit, %
  status: 'under' | 'on_track' | 'over'
  breachAt: Date | null       // when cumulative spend crosses the limit (null if not within period)
  summary: string             // one-line human-readable guidance
}

function periodBounds(period: BudgetResult['budget']['period'], now: Date): { start: Date; end: Date } {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  if (period === 'daily') {
    const end = new Date(start); end.setDate(end.getDate() + 1); return { start, end }
  }
  if (period === 'weekly') {
    start.setDate(start.getDate() - start.getDay()) // back to Sunday
    const end = new Date(start); end.setDate(end.getDate() + 7); return { start, end }
  }
  start.setDate(1)
  return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) }
}

function relativeTime(target: Date, now: Date): string {
  const ms = target.getTime() - now.getTime()
  if (ms <= 0) return 'now'
  const hours = ms / 3_600_000
  if (hours < 1) return `in ${Math.max(1, Math.round(ms / 60_000))}m`
  if (hours < 24) return `in ${Math.round(hours)}h`
  const days = hours / 24
  if (days < 7) {
    const weekday = target.toLocaleDateString('en-US', { weekday: 'long' })
    return Math.round(days) <= 1 ? `tomorrow (${weekday})` : weekday
  }
  return `in ${Math.round(days)}d`
}

export function projectBudget(result: BudgetResult, now: Date = new Date()): BudgetPace {
  const { start, end } = periodBounds(result.budget.period, now)
  const total = end.getTime() - start.getTime()
  const elapsed = Math.min(total, Math.max(0, now.getTime() - start.getTime()))
  const elapsedFrac = total > 0 ? elapsed / total : 0
  const limit = result.budget.limitCents
  const spent = result.spentCents

  const projectedEndCents = elapsedFrac > 0 ? Math.round(spent / elapsedFrac) : spent
  const projectedPct = limit > 0 ? Math.round((projectedEndCents / limit) * 100) : 0

  // Constant-rate crossing time from the start of the period.
  let breachAt: Date | null = null
  if (spent > 0 && elapsed > 0 && limit > 0) {
    const ratePerMs = spent / elapsed
    const t = start.getTime() + limit / ratePerMs
    if (t <= end.getTime()) breachAt = new Date(Math.max(t, now.getTime()))
  }

  const status: BudgetPace['status'] = projectedPct > 100 ? 'over' : projectedPct >= 90 ? 'on_track' : 'under'

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`
  let summary: string
  if (spent >= limit && limit > 0) {
    summary = `over budget — ${fmt(spent - limit)} past the ${fmt(limit)} limit`
  } else if (breachAt) {
    summary = `on pace to hit the ${fmt(limit)} limit ${relativeTime(breachAt, now)}`
  } else if (limit > 0) {
    summary = `on track — projected ${fmt(projectedEndCents)} of ${fmt(limit)} (${projectedPct}%)`
  } else {
    summary = `projected ${fmt(projectedEndCents)} this ${result.budget.period}`
  }

  return { elapsedPct: Math.round(elapsedFrac * 100), projectedEndCents, projectedPct, status, breachAt, summary }
}
