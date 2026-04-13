import type { Budget, Session } from '../types.js'

export interface BudgetResult {
  budget: Budget
  spentCents: number
  pct: number
  alert: boolean
}

function periodStart(period: Budget['period']): Date {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  if (period === 'daily') return now
  if (period === 'weekly') { now.setDate(now.getDate() - now.getDay()); return now }
  now.setDate(1); return now
}

export function checkBudgets(budgets: Budget[], sessions: Session[]): BudgetResult[] {
  return budgets.map(budget => {
    const start = periodStart(budget.period)
    let relevantSessions = sessions.filter(s => s.startedAt >= start)
    if (budget.scope === 'repo' && budget.scopeValue)
      relevantSessions = relevantSessions.filter(s => s.gitRepo === budget.scopeValue)
    else if (budget.scope === 'project' && budget.scopeValue)
      relevantSessions = relevantSessions.filter(s => s.cwd?.startsWith(budget.scopeValue!))
    const spentMillicents = relevantSessions.reduce((sum, s) => sum + s.costMillicents, 0)
    const spentCents = Math.round(spentMillicents / 1000)
    const pct = budget.limitCents > 0 ? Math.round((spentCents / budget.limitCents) * 100) : 0
    return { budget, spentCents, pct, alert: pct >= budget.alertAtPct }
  })
}
