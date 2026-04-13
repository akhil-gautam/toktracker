import React from 'react'
import { Box } from 'ink'
import { HeroMetrics } from './HeroMetrics.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface OverviewTabProps {
  store: SessionStore
  budgetResults: BudgetResult[]
}

export function OverviewTab({ store, budgetResults }: OverviewTabProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <HeroMetrics store={store} budgetResults={budgetResults} />
    </Box>
  )
}
