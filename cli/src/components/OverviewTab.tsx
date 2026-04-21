import React from 'react'
import { Box } from 'ink'
import type Database from 'better-sqlite3'
import { HeroMetrics } from './HeroMetrics.js'
import { TodayDetail } from './TodayDetail.js'
import { ActivityHero } from './ActivityHero.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface OverviewTabProps {
  store: SessionStore
  budgetResults: BudgetResult[]
  db: Database.Database
}

export function OverviewTab({ store, budgetResults, db }: OverviewTabProps) {
  const todayDetail = store.getTodayDetail()
  return (
    <Box flexDirection="column" paddingX={1}>
      <ActivityHero db={db} store={store} />
      <HeroMetrics store={store} budgetResults={budgetResults} />
      <TodayDetail detail={todayDetail} />
    </Box>
  )
}
