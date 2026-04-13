import React from 'react'
import { Box, Text } from 'ink'
import type { ToolStats } from '../types.js'
import { TOOL_COLORS, TOOL_LABELS, formatCost } from '../theme.js'

interface ToolBreakdownProps { tools: ToolStats[] }

export function ToolBreakdown({ tools }: ToolBreakdownProps) {
  if (tools.length === 0) return null
  return (
    <Box gap={2}>
      {tools.map((stat, i) => (
        <React.Fragment key={stat.tool}>
          {i > 0 && <Text color="gray">{'\u2502'}</Text>}
          <Box>
            <Text color={TOOL_COLORS[stat.tool] ?? 'white'}>{TOOL_LABELS[stat.tool] ?? stat.tool}</Text>
            <Text color="white" bold> {formatCost(stat.costMillicents)}</Text>
          </Box>
        </React.Fragment>
      ))}
    </Box>
  )
}
