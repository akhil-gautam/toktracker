import React from 'react'
import { Box, Text } from 'ink'
import { Sparkline } from './Sparkline.js'
import { InfoCard } from './InfoCard.js'
import { useAnimatedCost } from '../hooks/useAnimatedValue.js'
import { formatCost, budgetColor, BAR_FULL, BAR_EMPTY, TOOL_LABELS } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface HeroMetricsProps {
  store: SessionStore
  budgetResults: BudgetResult[]
}

export function HeroMetrics({ store, budgetResults }: HeroMetricsProps) {
  const today = store.getTodayStats()
  const weekTotal = store.getWeekTotal()
  const weekDelta = store.getWeekOverWeekDelta()
  const activeTools = store.getActiveTools()
  const topRepo = store.getTopRepo()
  const weekStats = store.getWeekStats()
  const weekCosts = weekStats.map(d => d.costMillicents)

  const todayCost = useAnimatedCost(today.costMillicents)
  const topBudget = budgetResults.length > 0 ? budgetResults.sort((a, b) => b.pct - a.pct)[0] : null

  const deltaStr = weekDelta >= 0 ? `\u2191${weekDelta}%` : `\u2193${Math.abs(weekDelta)}%`
  const deltaColor = weekDelta >= 0 ? '#FF5722' : '#4CAF50'

  return (
    <Box flexDirection="column">
      {/* Hero cost */}
      <Box flexDirection="column" marginBottom={1} paddingLeft={6}>
        <Text color="#4CAF50" bold>{todayCost}</Text>
        <Box>
          <Text color="gray">today's spend  </Text>
          <Sparkline values={weekCosts} colorScale />
          <Text color="gray">  7d</Text>
        </Box>
      </Box>

      {/* Info cards - 2x2 grid */}
      <Box marginBottom={1} gap={1}>
        <InfoCard>
          <Text color="#64B5F6" bold>{formatCost(weekTotal)}</Text>
          <Text color="gray"> this week</Text>
          <Text color={deltaColor}>{deltaStr} from last week</Text>
        </InfoCard>
        <InfoCard>
          <Text color="#E8A838" bold>{activeTools.length} tools</Text>
          <Text color="gray"> active</Text>
          <Text color="gray" dimColor>{activeTools.map(t => TOOL_LABELS[t] ?? t).join(', ')}</Text>
        </InfoCard>
      </Box>
      <Box gap={1}>
        {topBudget ? (
          <InfoCard borderColor={topBudget.pct >= 80 ? 'red' : undefined}>
            <Text color={budgetColor(topBudget.pct)} bold>{topBudget.pct}%</Text>
            <Text color="gray"> budget used</Text>
            <Text color="gray" dimColor>{formatCost(topBudget.spentCents * 1000)} / {formatCost(topBudget.budget.limitCents * 1000)}</Text>
          </InfoCard>
        ) : (
          <InfoCard>
            <Text color="gray">No budget set</Text>
            <Text color="gray" dimColor>/budget set to create</Text>
          </InfoCard>
        )}
        {topRepo ? (
          <InfoCard>
            <Text color="#7C6FE0" bold>{topRepo.repo.split('/').pop()}</Text>
            <Text color="gray"> top repo today</Text>
            <Text color="gray" dimColor>{formatCost(topRepo.costMillicents)} across {topRepo.sessionCount} sessions</Text>
          </InfoCard>
        ) : (
          <InfoCard>
            <Text color="gray">No repos tracked</Text>
            <Text color="gray" dimColor>Sessions need git cwd</Text>
          </InfoCard>
        )}
      </Box>
    </Box>
  )
}
