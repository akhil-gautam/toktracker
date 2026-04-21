import React from 'react'
import { Text } from 'ink'
import { SPARKLINE_CHARS } from '../theme.js'

interface SparklineProps {
  values: number[]
  color?: string
  colorScale?: boolean  // if true, each char colored by value magnitude
  stretch?: number      // horizontal repeat per value (default 1)
}

export function Sparkline({ values, color, colorScale, stretch = 1 }: SparklineProps) {
  if (values.length === 0) return <Text color="gray">-</Text>

  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const range = max - min || 1

  const chars = values.map(v => {
    const idx = Math.round(((v - min) / range) * (SPARKLINE_CHARS.length - 1))
    return SPARKLINE_CHARS[idx].repeat(stretch)
  })

  if (!colorScale) {
    return <Text color={color ?? 'cyan'}>{chars.join('')}</Text>
  }

  return (
    <>
      {chars.map((ch, i) => {
        const ratio = (values[i] - min) / range
        const c = ratio < 0.4 ? '#4CAF50' : ratio < 0.7 ? '#FFC107' : '#FF5722'
        return <Text key={i} color={c}>{ch}</Text>
      })}
    </>
  )
}
