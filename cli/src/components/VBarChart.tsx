import React from 'react'
import { Box, Text } from 'ink'
import { SPARKLINE_CHARS } from '../theme.js'

interface VBarChartProps {
  values: number[]
  height?: number      // rows tall (default 6)
  stretch?: number     // cols per value (default 3)
  colorScale?: boolean
  color?: string
  labels?: string[]    // optional x-axis labels (one per value; empty string = no label)
}

// Multi-row vertical bar chart. Each value is rendered as a vertical bar
// `stretch` columns wide and up to `height` rows tall. Top row uses fractional
// block chars for smooth tops.
export function VBarChart({ values, height = 6, stretch = 3, colorScale, color, labels }: VBarChartProps) {
  if (values.length === 0) return <Text color="gray">-</Text>

  const max = Math.max(...values, 1)
  const min = 0
  const range = max - min || 1
  const steps = SPARKLINE_CHARS.length - 1 // 8 levels per row
  const maxLevel = height * steps

  const levels = values.map(v => Math.round(((v - min) / range) * maxLevel))

  // Row index 0 = top, height-1 = bottom
  const rows: React.ReactNode[] = []
  for (let r = 0; r < height; r++) {
    const rowFromBottom = height - 1 - r
    const rowThreshold = rowFromBottom * steps
    const cells = levels.map((lvl, i) => {
      const remaining = lvl - rowThreshold
      let ch: string
      if (remaining >= steps) ch = '\u2588' // full block
      else if (remaining <= 0) ch = ' '
      else ch = SPARKLINE_CHARS[remaining]
      const repeated = ch.repeat(stretch)
      if (colorScale) {
        const ratio = (values[i] - min) / range
        const c = ratio < 0.4 ? '#4CAF50' : ratio < 0.7 ? '#FFC107' : '#FF5722'
        return <Text key={i} color={c}>{repeated}</Text>
      }
      return <Text key={i} color={color ?? 'cyan'}>{repeated}</Text>
    })
    rows.push(<Box key={r}>{cells}</Box>)
  }

  // Build x-axis line from labels + tick row above it
  let axisRow: React.ReactNode = null
  let tickRow: React.ReactNode = null
  if (labels && labels.length === values.length) {
    const totalCols = values.length * stretch
    const tick = Array<string>(totalCols).fill('\u2500')
    const line = Array<string>(totalCols).fill(' ')
    for (let i = 0; i < labels.length; i++) {
      const lbl = labels[i]
      if (!lbl) continue
      const start = i * stretch
      // center label within its bar cols (or clamp to bounds)
      const offset = Math.max(0, Math.floor((stretch - lbl.length) / 2))
      const pos = Math.min(totalCols - lbl.length, start + offset)
      // skip if overlapping previous label
      if (pos > 0 && line[pos - 1] !== ' ') continue
      for (let c = 0; c < lbl.length; c++) line[pos + c] = lbl[c]
      tick[Math.min(totalCols - 1, start + Math.floor(stretch / 2))] = '\u253C'
    }
    tickRow = <Text color="gray" dimColor>{tick.join('')}</Text>
    axisRow = <Text color="gray" dimColor>{line.join('')}</Text>
  }

  return (
    <Box flexDirection="column">
      {rows}
      {tickRow}
      {axisRow}
    </Box>
  )
}
