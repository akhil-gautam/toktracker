import React from 'react'
import { Box, Text } from 'ink'
// @ts-expect-error — asciichart has no types
import asciichart from 'asciichart'

interface LineChartProps {
  values: number[]              // cost in millicents
  labels?: string[]             // x-axis labels (one per value)
  height?: number               // chart height in rows (default 12)
  color?: string                // hex color for the line
  title?: string
  subtitle?: string
}

function formatUSD(millicents: number): string {
  const dollars = millicents / 100_000
  if (dollars >= 100) return `$${dollars.toFixed(0)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}

export function LineChart({ values, labels, height = 12, color, title, subtitle }: LineChartProps) {
  if (values.length === 0) {
    return (
      <Box flexDirection="column">
        {title && <Text color="cyan" bold>{title}</Text>}
        <Text color="gray">No data</Text>
      </Box>
    )
  }

  // Convert millicents to dollars for display
  const dollarValues = values.map(v => v / 100_000)

  // Render chart — asciichart takes values array + config
  const chartStr: string = asciichart.plot(dollarValues, {
    height,
    format: (x: number) => formatUSD(x * 100_000).padStart(8),
    padding: '        ',
  })

  // Build x-axis labels strip
  let labelRow: string | null = null
  if (labels && labels.length > 0) {
    // Space labels evenly across chart width
    // asciichart outputs lines of equal width; measure from the first line
    const firstLine = chartStr.split('\n')[0]
    const chartWidth = firstLine.length
    const labelAreaStart = 9 // account for y-axis prefix
    const innerWidth = chartWidth - labelAreaStart
    const step = Math.max(1, Math.floor(labels.length / Math.min(labels.length, 8)))
    const parts: string[] = [' '.repeat(labelAreaStart)]
    let used = labelAreaStart
    for (let i = 0; i < labels.length; i += step) {
      const pos = labelAreaStart + Math.round((i / Math.max(1, labels.length - 1)) * innerWidth)
      if (pos > used) {
        parts.push(' '.repeat(pos - used))
        used = pos
      }
      parts.push(labels[i])
      used += labels[i].length
    }
    labelRow = parts.join('')
  }

  return (
    <Box flexDirection="column">
      {title && (
        <Box>
          <Text color="cyan" bold>{title}</Text>
          {subtitle && <Text color="gray" dimColor>  {subtitle}</Text>}
        </Box>
      )}
      <Text color={color ?? '#4CAF50'}>{chartStr}</Text>
      {labelRow && <Text color="gray" dimColor>{labelRow}</Text>}
    </Box>
  )
}
