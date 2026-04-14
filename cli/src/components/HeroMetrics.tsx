import React from 'react'
import { Box, Text } from 'ink'
import { Sparkline } from './Sparkline.js'
import { StatCard } from './StatCard.js'
import { useAnimatedCost } from '../hooks/useAnimatedValue.js'
import { formatCost, formatTokens } from '../theme.js'
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
  const allTime = store.getAllTimeStats()
  const weekStats = store.getWeekStats()
  const weekCosts = weekStats.map(d => d.costMillicents)

  const todayCost = useAnimatedCost(today.costMillicents)
  const topBudget = budgetResults.length > 0 ? budgetResults.sort((a, b) => b.pct - a.pct)[0] : null

  const avgPerSession = allTime.sessionCount > 0
    ? allTime.costMillicents / allTime.sessionCount
    : 0

  const earliest = store.getDateRange()?.earliest
  const dateRange = earliest
    ? `${earliest.toISOString().slice(0, 10)} \u2192 ${new Date().toISOString().slice(0, 10)}`
    : 'no data'

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

      {/* Row 1: All-time stats */}
      <Box marginBottom={0} gap={1}>
        <StatCard
          label="Total Spend"
          value={formatCost(allTime.costMillicents)}
          valueColor="#4CAF50"
          caption={`${(allTime.costMillicents / 100_000).toFixed(2)} USD all-time`}
        />
        <StatCard
          label="Total Sessions"
          value={allTime.sessionCount.toLocaleString()}
          valueColor="#42A5F5"
          caption={dateRange}
        />
        <StatCard
          label="Output Tokens"
          value={formatTokens(allTime.outputTokens)}
          valueColor="#CE93D8"
          caption={`${formatTokens(Math.round(allTime.outputTokens / Math.max(1, allTime.sessionCount)))} avg/session`}
        />
        <StatCard
          label="Cache Reuse Ratio"
          value={`${(allTime.cacheReuseRatio * 100).toFixed(1)}%`}
          valueColor="#29B6F6"
          caption="cache_read / (in + cache)"
        />
      </Box>

      {/* Row 2: Week / today stats */}
      <Box gap={1}>
        <StatCard
          label="This Week"
          value={formatCost(weekTotal)}
          valueColor="#64B5F6"
          delta={{ value: weekDelta, positiveBad: true }}
        />
        <StatCard
          label="Input Tokens"
          value={formatTokens(allTime.inputTokens)}
          valueColor="#FFC107"
          caption={`${formatTokens(allTime.cacheReadTokens)} from cache`}
        />
        <StatCard
          label="Active Days"
          value={String(allTime.activeDays)}
          valueColor="#FF9800"
          caption={`${allTime.uniqueModels} models \u00B7 ${allTime.uniqueTools} tools`}
        />
        {topBudget ? (
          <StatCard
            label="Top Budget"
            value={`${topBudget.pct}%`}
            valueColor={topBudget.pct >= 80 ? '#FF5252' : topBudget.pct >= 50 ? '#FFC107' : '#4CAF50'}
            caption={`${formatCost(topBudget.spentCents * 1000)} / ${formatCost(topBudget.budget.limitCents * 1000)}`}
          />
        ) : (
          <StatCard
            label="Avg / Session"
            value={formatCost(avgPerSession)}
            valueColor="#FF7043"
            caption={`across ${allTime.sessionCount.toLocaleString()} sessions`}
          />
        )}
      </Box>
    </Box>
  )
}
