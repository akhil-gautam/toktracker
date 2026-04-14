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

function row(text: string, innerWidth: number): string {
  // Full-width line: 1 leading space + truncated text + trailing fill
  return ' ' + truncate(text, innerWidth - 2).padEnd(innerWidth - 1)
}

export function StatCard({
  label, value, valueColor, caption, delta, width = 26, backgroundColor = '#0E1420',
}: StatCardProps) {
  // width includes borders (2). Inner padded width = width - 2.
  const innerWidth = width - 2

  const labelLine = row(label.toUpperCase(), innerWidth)
  const valueLine = row(value, innerWidth)
  const captionLine = caption ? row(caption, innerWidth) : null
  const blankLine = ' '.repeat(innerWidth)

  let deltaEl: React.ReactNode = null
  if (delta) {
    const arrow = delta.value >= 0 ? '\u25B2' : '\u25BC'
    const bad = delta.positiveBad !== false ? delta.value > 0 : delta.value < 0
    const pillColor = bad ? '#FF5252' : '#4CAF50'
    const pillText = truncate(`${arrow} ${Math.abs(delta.value).toFixed(1)}% vs last week`, innerWidth - 4)
    const padding = Math.max(0, innerWidth - pillText.length - 3)
    deltaEl = (
      <Box>
        <Text backgroundColor={backgroundColor}> </Text>
        <Text backgroundColor={pillColor} color="white" bold> {pillText} </Text>
        <Text backgroundColor={backgroundColor}>{' '.repeat(padding)}</Text>
      </Box>
    )
  }

  return (
    <Box
      borderStyle="round"
      borderColor="#2a3040"
      width={width}
      flexDirection="column"
    >
      <Text backgroundColor={backgroundColor}>{blankLine}</Text>
      <Text backgroundColor={backgroundColor} color="#6B7280" bold>{labelLine}</Text>
      <Text backgroundColor={backgroundColor} color={valueColor} bold>{valueLine}</Text>
      {deltaEl ?? <Text backgroundColor={backgroundColor}>{blankLine}</Text>}
      {captionLine
        ? <Text backgroundColor={backgroundColor} color="#6B7280">{captionLine}</Text>
        : <Text backgroundColor={backgroundColor}>{blankLine}</Text>}
      <Text backgroundColor={backgroundColor}>{blankLine}</Text>
    </Box>
  )
}
