import React from 'react'
import { Box, Text } from 'ink'
import { Sparkline } from './Sparkline.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'
import { formatCost, BAR_FULL, BAR_EMPTY, getModelColor } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function DayRow({ date, cost, maxCost, isToday, isPeak }: {
  date: string; cost: number; maxCost: number; isToday: boolean; isPeak: boolean
}) {
  const barWidth = 26
  const pct = maxCost > 0 ? cost / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 400)
  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))
  const color = pct < 0.4 ? '#4CAF50' : pct < 0.7 ? '#FFC107' : '#FF5722'

  const d = new Date(date + 'T12:00:00')
  const label = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).padEnd(7)} ${DAY_NAMES[d.getDay()]}`

  return (
    <Box>
      <Text color="gray">{label.padEnd(12)}</Text>
      <Text color={color}>{filled}</Text>
      <Text color="gray">{empty}</Text>
      <Text color="white" bold> {formatCost(cost).padStart(8)}</Text>
      {isPeak && <Text color="#FF5722">  {'\u2190'} peak</Text>}
      {isToday && !isPeak && <Text color="#4CAF50">  today</Text>}
    </Box>
  )
}

interface DailyTabProps { store: SessionStore }

export function DailyTab({ store }: DailyTabProps) {
  const days = store.getDailyStats(7)
  const totalCost = days.reduce((s, d) => s + d.costMillicents, 0)
  const maxCost = Math.max(...days.map(d => d.costMillicents), 1)
  const peakDate = days.reduce((max, d) => d.costMillicents > max.costMillicents ? d : max, days[0])?.date
  const todayStr = new Date().toISOString().slice(0, 10)
  const trends = store.getModelTrends()

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Daily Cost</Text>
        <Text color="gray">{'  '.padEnd(36)}</Text>
        <Text color="gray">Total: </Text><Text color="white" bold>{formatCost(totalCost)}</Text>
      </Box>
      <Box marginBottom={1}><Text color="gray" dimColor>{'─'.repeat(60)}</Text></Box>
      {days.map(day => (
        <DayRow key={day.date} date={day.date} cost={day.costMillicents}
          maxCost={maxCost} isToday={day.date === todayStr} isPeak={day.date === peakDate && day.costMillicents > 0} />
      ))}
      <Box marginTop={1}><Text color="gray" dimColor>{'─'.repeat(60)}</Text></Box>
      <Box marginTop={1} gap={2}>
        <Text color="gray" dimColor>Model trends (7d):</Text>
      </Box>
      <Box gap={3}>
        {Object.entries(trends).slice(0, 4).map(([model, values]) => (
          <Box key={model}>
            <Text color={getModelColor(model)}>{model.split('-').slice(-2).join('-').slice(0, 10).padEnd(10)} </Text>
            <Sparkline values={values} color={getModelColor(model)} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
