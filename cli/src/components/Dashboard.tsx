import React from 'react'
import { Box, Text } from 'ink'
import { Header } from './Header.js'
import { ModelBreakdown } from './ModelBreakdown.js'
import { ToolBreakdown } from './ToolBreakdown.js'
import { WeekChart } from './WeekChart.js'
import { useAnimatedCost } from '../hooks/useAnimatedValue.js'
import type { SessionStore } from '../services/session-store.js'

interface DashboardProps { store: SessionStore }

export function Dashboard({ store }: DashboardProps) {
  const today = store.getTodayStats()
  const weekTotal = store.getWeekTotal()
  const models = store.getModelStats()
  const tools = store.getToolStats()
  const weekDays = store.getWeekStats()
  const todayCost = useAnimatedCost(today.costMillicents)
  const weekCost = useAnimatedCost(weekTotal)
  const sep = '\u2500'.repeat(50)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header compact />
      <Box marginBottom={1} gap={4}>
        <Box><Text color="gray">Today: </Text><Text color="#4CAF50" bold>{todayCost}</Text></Box>
        <Box><Text color="gray">Week: </Text><Text color="#64B5F6" bold>{weekCost}</Text></Box>
      </Box>
      <Box marginBottom={1}><Text color="gray" dimColor>{sep}</Text></Box>
      <Box marginBottom={1} flexDirection="column"><ModelBreakdown models={models} /></Box>
      <Box marginBottom={1}><Text color="gray" dimColor>{sep}</Text></Box>
      <Box marginBottom={1}><ToolBreakdown tools={tools} /></Box>
      <Box marginBottom={1}><Text color="gray" dimColor>{sep}</Text></Box>
      <Box marginBottom={1}><WeekChart days={weekDays} /></Box>
      <Box><Text color="cyan">/ commands</Text><Text color="gray">  {'\u2022'}  </Text><Text color="gray">q quit</Text></Box>
    </Box>
  )
}
