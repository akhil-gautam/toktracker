import React from 'react'
import { Box, Text } from 'ink'

interface StatCardProps {
  label: string
  value: string
  valueColor: string
  caption?: string
  delta?: { value: number; positiveBad?: boolean }  // positiveBad: if true, ▲ is red (e.g. cost going up)
  width?: number
  backgroundColor?: string
}

export function StatCard({ label, value, valueColor, caption, delta, width = 26, backgroundColor = '#0E1420' }: StatCardProps) {
  // Pad content to force the backgroundColor to fill the whole width
  const contentWidth = width - 4 // account for border (2) + paddingX (2)

  let deltaEl: React.ReactNode = null
  if (delta) {
    const arrow = delta.value >= 0 ? '\u25B2' : '\u25BC'
    const bad = delta.positiveBad !== false ? delta.value > 0 : delta.value < 0
    const pillColor = bad ? '#FF5252' : '#4CAF50'
    const pillText = `${arrow} ${Math.abs(delta.value).toFixed(1)}% vs last week`
    deltaEl = (
      <Box marginTop={0}>
        <Text backgroundColor={pillColor} color="white" bold> {pillText} </Text>
      </Box>
    )
  }

  return (
    <Box
      borderStyle="round"
      borderColor="#2a3040"
      paddingX={1}
      paddingY={0}
      width={width}
      flexDirection="column"
    >
      <Box width={contentWidth}>
        <Text backgroundColor={backgroundColor} color="#6B7280" bold>
          {label.toUpperCase().padEnd(contentWidth)}
        </Text>
      </Box>
      <Box width={contentWidth}>
        <Text backgroundColor={backgroundColor} color={valueColor} bold>
          {value.padEnd(contentWidth)}
        </Text>
      </Box>
      {deltaEl}
      {caption && (
        <Box width={contentWidth}>
          <Text backgroundColor={backgroundColor} color="#6B7280">
            {caption.padEnd(contentWidth)}
          </Text>
        </Box>
      )}
    </Box>
  )
}
