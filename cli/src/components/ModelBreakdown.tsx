import React from 'react'
import { Box, Text } from 'ink'
import type { ModelStats } from '../types.js'
import { getModelColor, formatCost, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function ModelRow({ stat, maxCost }: { stat: ModelStats; maxCost: number }) {
  const barWidth = 20
  const pct = maxCost > 0 ? stat.costMillicents / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 300)
  const color = getModelColor(stat.model)
  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))
  const pctDisplay = maxCost > 0 ? Math.round((stat.costMillicents / maxCost) * 100) : 0
  const displayName = stat.model.length > 24 ? stat.model.slice(0, 21) + '...' : stat.model.padEnd(24)

  return (
    <Box>
      <Text color={color}>{displayName}</Text>
      <Text color="white" bold> {formatCost(stat.costMillicents).padStart(8)} </Text>
      <Text color={color}>{filled}</Text>
      <Text color="gray">{empty}</Text>
      <Text color="gray"> {String(pctDisplay).padStart(3)}%</Text>
    </Box>
  )
}

interface ModelBreakdownProps { models: ModelStats[] }

export function ModelBreakdown({ models }: ModelBreakdownProps) {
  if (models.length === 0) return <Box><Text color="gray" dimColor>No model data for today</Text></Box>
  const totalCost = models.reduce((sum, m) => sum + m.costMillicents, 0)
  return (
    <Box flexDirection="column">
      {models.map(stat => <ModelRow key={stat.model} stat={stat} maxCost={totalCost} />)}
    </Box>
  )
}
