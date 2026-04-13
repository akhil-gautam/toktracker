import React from 'react'
import { Box, Text } from 'ink'
import type { ModelStats } from '../types.js'
import { getModelColor, formatCost, formatTokens, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function ModelDetailRow({ stat, maxCost }: { stat: ModelStats; maxCost: number }) {
  const barWidth = 20
  const pct = maxCost > 0 ? stat.costMillicents / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 300)
  const color = getModelColor(stat.model)
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box><Text color={color} bold>{stat.model}</Text></Box>
      <Box><Text color={color}>  {BAR_FULL.repeat(animatedFill)}</Text><Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))}</Text><Text color="white" bold> {formatCost(stat.costMillicents)}</Text></Box>
      <Box><Text color="gray" dimColor>{'  '}In: {formatTokens(stat.inputTokens)}{'  '}Out: {formatTokens(stat.outputTokens)}{'  '}{stat.sessionCount} calls</Text></Box>
    </Box>
  )
}

interface ModelViewProps { models: ModelStats[] }

export function ModelView({ models }: ModelViewProps) {
  if (models.length === 0) return (
    <Box flexDirection="column" paddingX={1}><Box marginBottom={1}><Text color="cyan" bold>Models</Text></Box><Text color="gray">No model data for today.</Text></Box>
  )
  const totalCost = models.reduce((sum, m) => sum + m.costMillicents, 0)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Models</Text><Text color="gray"> {'\u2014'} today's usage by model</Text></Box>
      {models.map(stat => <ModelDetailRow key={stat.model} stat={stat} maxCost={totalCost} />)}
      <Box marginTop={1}><Text color="gray" dimColor>Total: {formatCost(totalCost)} across {models.reduce((s, m) => s + m.sessionCount, 0)} calls</Text></Box>
    </Box>
  )
}
