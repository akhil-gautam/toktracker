import React from 'react'
import { Box, Text } from 'ink'
import type { DayStats } from '../types.js'
import { formatCost, formatTokens, BAR_FULL } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function TimelineRow({ day, maxCost }: { day: DayStats; maxCost: number }) {
  const barWidth = 25
  const pct = maxCost > 0 ? day.costMillicents / maxCost : 0
  const animatedWidth = useAnimatedValue(Math.round(pct * barWidth), 400)
  const dateObj = new Date(day.date + 'T12:00:00')
  const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const color = pct < 0.5 ? '#4CAF50' : pct < 0.8 ? '#FFC107' : '#FF5722'
  return (
    <Box>
      <Text color="gray">{dateStr.padEnd(14)}</Text>
      <Text color={color}>{BAR_FULL.repeat(Math.max(0, animatedWidth)).padEnd(barWidth)}</Text>
      <Text color="white" bold> {formatCost(day.costMillicents).padStart(8)}</Text>
      <Text color="gray"> {formatTokens(day.inputTokens + day.outputTokens).padStart(8)} tok</Text>
      <Text color="gray" dimColor> {String(day.sessionCount).padStart(3)} sess</Text>
    </Box>
  )
}

interface TimelineViewProps { days: DayStats[] }

export function TimelineView({ days }: TimelineViewProps) {
  const maxCost = Math.max(...days.map(d => d.costMillicents), 1)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Timeline</Text><Text color="gray"> (last 7 days)</Text></Box>
      {days.map(day => <TimelineRow key={day.date} day={day} maxCost={maxCost} />)}
      <Box marginTop={1}><Text color="gray" dimColor>Total: {formatCost(days.reduce((s, d) => s + d.costMillicents, 0))} across {days.reduce((s, d) => s + d.sessionCount, 0)} sessions</Text></Box>
    </Box>
  )
}
