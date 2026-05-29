import React from 'react'
import { Box, Text } from 'ink'
import type Database from 'better-sqlite3'
import { HeroMetrics } from './HeroMetrics.js'
import { TodayDetail } from './TodayDetail.js'
import { ActivityHero } from './ActivityHero.js'
import { UnpricedBanner } from './UnpricedBanner.js'
import { formatCost } from '../theme.js'
import { projectSpend, projectBudget } from '../services/pace.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface OverviewTabProps {
  store: SessionStore
  budgetResults: BudgetResult[]
  db: Database.Database
  columns?: number
}

/** Forward-looking run-rate line: where this month lands at the current pace, plus
 *  the most at-risk budget (if any). Works with or without a budget configured. */
function ProjectionLine({ store, budgetResults }: { store: SessionStore; budgetResults: BudgetResult[] }) {
  const now = new Date()
  const ym = now.toISOString().slice(0, 10).slice(0, 7)
  const monthMillicents = store.getDailyStats(31)
    .filter(d => d.date.startsWith(ym))
    .reduce((s, d) => s + d.costMillicents, 0)
  const proj = projectSpend(Math.round(monthMillicents / 1000), 'monthly', now)

  // Worst budget by projected % (over the limit first).
  const atRisk = budgetResults
    .map(r => ({ r, p: projectBudget(r, now) }))
    .filter(x => x.p.status !== 'under')
    .sort((a, b) => b.p.projectedPct - a.p.projectedPct)[0]

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="#64B5F6">▸ </Text>
        <Text color="gray">this month </Text>
        <Text bold>{formatCost(proj.spentCents * 1000)}</Text>
        <Text color="gray"> so far · projected </Text>
        <Text bold color="#FFC107">{formatCost(proj.projectedEndCents * 1000)}</Text>
        <Text color="gray"> at current rate ({proj.elapsedPct}% of month elapsed)</Text>
      </Box>
      {atRisk && (
        <Box>
          <Text color={atRisk.p.status === 'over' ? '#FF5252' : '#FFC107'}>
            {'  ⚠ '}{atRisk.r.budget.scope === 'global' ? 'Budget' : atRisk.r.budget.scopeValue} {atRisk.p.summary}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export function OverviewTab({ store, budgetResults, columns = 80 }: OverviewTabProps) {
  const todayDetail = store.getTodayDetail()
  const unpricedCount = store.getAllTimeStats().unpricedSessionCount
  return (
    <Box flexDirection="column" paddingX={1}>
      <ActivityHero store={store} />
      <HeroMetrics store={store} budgetResults={budgetResults} columns={columns} />
      <ProjectionLine store={store} budgetResults={budgetResults} />
      <UnpricedBanner count={unpricedCount} />
      <TodayDetail detail={todayDetail} columns={columns} />
    </Box>
  )
}
