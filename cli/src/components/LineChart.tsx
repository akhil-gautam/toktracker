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
  xStretch?: number             // horizontal stretch factor (default 1, e.g. 3 = triple width)
}

function formatUSD(millicents: number): string {
  const dollars = millicents / 100_000
  if (dollars >= 100) return `$${dollars.toFixed(0)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}

export function LineChart({ values, labels, height = 12, color, title, subtitle, xStretch = 3 }: LineChartProps) {
  if (values.length === 0) {
    return (
      <Box flexDirection="column">
        {title && <Text color="cyan" bold>{title}</Text>}
        <Text color="gray">No data</Text>
      </Box>
    )
  }

  // Convert millicents to dollars for display
  const baseValues = values.map(v => v / 100_000)

  // Stretch horizontally by interpolating extra points between each original point
  const dollarValues: number[] = []
  if (xStretch <= 1 || baseValues.length < 2) {
    dollarValues.push(...baseValues)
  } else {
    for (let i = 0; i < baseValues.length - 1; i++) {
      const a = baseValues[i]
      const b = baseValues[i + 1]
      for (let k = 0; k < xStretch; k++) {
        dollarValues.push(a + (b - a) * (k / xStretch))
      }
    }
    dollarValues.push(baseValues[baseValues.length - 1])
  }

  // Render chart — asciichart takes values array + config
  const chartStr: string = asciichart.plot(dollarValues, {
    height,
    format: (x: number) => formatUSD(x * 100_000).padStart(8),
    padding: '        ',
  })

  // Build x-axis labels strip — ensure MIN_GAP chars between labels to avoid cramping
  let labelRow: string | null = null
  if (labels && labels.length > 0) {
    const firstLine = chartStr.split('\n')[0]
    const chartWidth = firstLine.length
    const labelAreaStart = 9
    const innerWidth = chartWidth - labelAreaStart
    const maxLabelLen = Math.max(...labels.map(l => l.length))
    const MIN_GAP = 3
    const slotWidth = maxLabelLen + MIN_GAP
    const maxLabels = Math.max(2, Math.floor(innerWidth / slotWidth))
    const step = Math.max(1, Math.ceil(labels.length / maxLabels))

    const parts: string[] = [' '.repeat(labelAreaStart)]
    let used = labelAreaStart
    for (let i = 0; i < labels.length; i += step) {
      const pos = labelAreaStart + Math.round((i / Math.max(1, labels.length - 1)) * (innerWidth - labels[i].length))
      if (pos > used) {
        parts.push(' '.repeat(pos - used))
        used = pos
      } else if (pos < used) {
        continue // skip label that would overlap
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
