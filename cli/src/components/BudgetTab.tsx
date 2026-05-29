import React from 'react'
import { Box, Text } from 'ink'
import { BudgetBar } from './BudgetBar.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface BudgetTabProps { results: BudgetResult[] }

export function BudgetTab({ results }: BudgetTabProps) {
  if (results.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}><Text color="cyan" bold>Budgets</Text></Box>
        <Text color="gray">No budgets configured. Press <Text color="cyan">/</Text> and type:</Text>
        <Box marginTop={1} flexDirection="column">
          <Text><Text color="cyan">  /budget set 50 weekly</Text><Text color="gray" dimColor>    $50 per week</Text></Text>
          <Text><Text color="cyan">  /budget set 500 monthly</Text><Text color="gray" dimColor>  $500 per month</Text></Text>
          <Text><Text color="cyan">  /budget set 20 daily</Text><Text color="gray" dimColor>     $20 per day</Text></Text>
          <Text><Text color="cyan">  /budget clear</Text><Text color="gray" dimColor>            remove all budgets</Text></Text>
        </Box>
        <Box marginTop={1}><Text color="gray" dimColor>Once set, each shows a pace projection — when you'll hit the limit.</Text></Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Budgets</Text><Text color="gray" dimColor>{'   /budget set <amount> [daily|weekly|monthly]  ·  /budget clear'}</Text></Box>
      {results.map(r => <Box key={r.budget.id} marginBottom={1}><BudgetBar result={r} /></Box>)}
    </Box>
  )
}
