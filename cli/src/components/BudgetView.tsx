import React from 'react'
import { Box, Text } from 'ink'
import { BudgetBar } from './BudgetBar.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface BudgetViewProps { results: BudgetResult[] }

export function BudgetView({ results }: BudgetViewProps) {
  if (results.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}><Text color="cyan" bold>Budgets</Text></Box>
        <Text color="gray">No budgets configured.</Text>
        <Text color="gray" dimColor>Use <Text color="cyan">/budget set</Text> to create one.</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Budgets</Text></Box>
      {results.map(r => <Box key={r.budget.id} marginBottom={1}><BudgetBar result={r} /></Box>)}
    </Box>
  )
}
