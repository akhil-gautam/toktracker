import React from 'react'
import { Box, Text } from 'ink'

interface StatCardProps {
  label: string
  value: string
  valueColor: string
  caption?: string
  delta?: { value: number; positiveBad?: boolean }
  width?: number
  backgroundColor?: string
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + '\u2026'
}

export function StatCard({
  label, value, valueColor, caption, delta, width = 26, backgroundColor = '#0E1420',
}: StatCardProps) {
  const innerWidth = width - 4 // border (2) + paddingX (2)

  const labelLine = truncate(label.toUpperCase(), innerWidth).padEnd(innerWidth)
  const valueLine = truncate(value, innerWidth).padEnd(innerWidth)
  const captionLine = caption ? truncate(caption, innerWidth).padEnd(innerWidth) : null

  let deltaEl: React.ReactNode = null
  if (delta) {
    const arrow = delta.value >= 0 ? '\u25B2' : '\u25BC'
    const bad = delta.positiveBad !== false ? delta.value > 0 : delta.value < 0
    const pillColor = bad ? '#FF5252' : '#4CAF50'
    const pillText = truncate(`${arrow} ${Math.abs(delta.value).toFixed(1)}% vs last week`, innerWidth - 2)
    deltaEl = (
      <Box>
        <Text backgroundColor={pillColor} color="white" bold> {pillText} </Text>
        <Text backgroundColor={backgroundColor}>{' '.repeat(Math.max(0, innerWidth - pillText.length - 2))}</Text>
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
      <Text backgroundColor={backgroundColor} color="#6B7280" bold>{labelLine}</Text>
      <Text backgroundColor={backgroundColor} color={valueColor} bold>{valueLine}</Text>
      {deltaEl}
      {captionLine && <Text backgroundColor={backgroundColor} color="#6B7280">{captionLine}</Text>}
    </Box>
  )
}
