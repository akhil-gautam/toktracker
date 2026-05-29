import React from 'react'
import { Box } from 'ink'
import type Database from 'better-sqlite3'
import { HeroMetrics } from './HeroMetrics.js'
import { TodayDetail } from './TodayDetail.js'
import { ActivityHero } from './ActivityHero.js'
import { UnpricedBanner } from './UnpricedBanner.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface OverviewTabProps {
  store: SessionStore
  budgetResults: BudgetResult[]
  db: Database.Database
  columns?: number
}

export function OverviewTab({ store, budgetResults, columns = 80 }: OverviewTabProps) {
  const todayDetail = store.getTodayDetail()
  const unpricedCount = store.getAllTimeStats().unpricedSessionCount
  return (
    <Box flexDirection="column" paddingX={1}>
      <ActivityHero store={store} columns={columns} />
      <HeroMetrics store={store} budgetResults={budgetResults} columns={columns} />
      <UnpricedBanner count={unpricedCount} />
      <TodayDetail detail={todayDetail} columns={columns} />
    </Box>
  )
}
