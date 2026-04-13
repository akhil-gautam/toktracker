import React from 'react'
import { Box, Text } from 'ink'
import { budgetColor, formatCost, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface BudgetBarProps { result: BudgetResult }

export function BudgetBar({ result }: BudgetBarProps) {
  const barWidth = 25
  const clampedPct = Math.min(result.pct, 100)
  const animatedFill = useAnimatedValue(Math.round((clampedPct / 100) * barWidth), 500)
  const color = budgetColor(result.pct)
  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))
  const label = result.budget.scope === 'global' ? `Global ${result.budget.period}` : `${result.budget.scopeValue} ${result.budget.period}`

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="white">{label.padEnd(30)}</Text>
        <Text color={color}>{filled}</Text><Text color="gray">{empty}</Text>
        <Text color={color} bold> {result.pct}%</Text>
      </Box>
      <Box><Text color="gray">{'  '}{formatCost(result.spentCents * 1000)} / {formatCost(result.budget.limitCents * 1000)}</Text></Box>
    </Box>
  )
}

export function BudgetAlert({ result }: BudgetBarProps) {
  if (!result.alert) return null
  const label = result.budget.scope === 'global' ? 'All projects' : result.budget.scopeValue ?? ''
  return (
    <Box borderStyle="bold" borderColor="red" paddingX={2} paddingY={0} marginBottom={1}>
      <Text color="red" bold>
        {'\u26A0  Budget alert: '}{label}{'  '}{formatCost(result.spentCents * 1000)} / {formatCost(result.budget.limitCents * 1000)}{' '}{result.budget.period} limit ({result.pct}%)
      </Text>
    </Box>
  )
}
