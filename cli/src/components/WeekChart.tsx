import React from 'react'
import { Box, Text } from 'ink'
import type { DayStats } from '../types.js'
import { formatCost, BAR_FULL } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function dayLabel(dateStr: string): string { return DAY_NAMES[new Date(dateStr + 'T12:00:00').getDay()] }
function barColor(pct: number): string { if (pct < 0.4) return '#4CAF50'; if (pct < 0.7) return '#FFC107'; return '#FF5722' }

function DayBar({ day, maxCost }: { day: DayStats; maxCost: number }) {
  const maxBarWidth = 30
  const pct = maxCost > 0 ? day.costMillicents / maxCost : 0
  const animatedWidth = useAnimatedValue(Math.round(pct * maxBarWidth), 400)
  return (
    <Box>
      <Text color="gray">{dayLabel(day.date)} </Text>
      <Text color={barColor(pct)}>{BAR_FULL.repeat(Math.max(0, animatedWidth))}</Text>
      <Text color="gray"> {formatCost(day.costMillicents)}</Text>
    </Box>
  )
}

interface WeekChartProps { days: DayStats[] }

export function WeekChart({ days }: WeekChartProps) {
  const maxCost = Math.max(...days.map(d => d.costMillicents), 1)
  return (
    <Box flexDirection="column">
      <Text color="gray" dimColor>7-day trend:</Text>
      {days.map(day => <DayBar key={day.date} day={day} maxCost={maxCost} />)}
    </Box>
  )
}
