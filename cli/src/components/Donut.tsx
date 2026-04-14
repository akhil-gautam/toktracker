import React from 'react'
import { Box, Text } from 'ink'

interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutProps {
  slices: DonutSlice[]
  width?: number     // char width
  height?: number    // char height (rows)
  centerLabel?: string
}

// Curated palette for slices when not explicitly colored
const DEFAULT_PALETTE = [
  '#EF5350', '#AB47BC', '#5C6BC0', '#29B6F6', '#26A69A',
  '#66BB6A', '#D4E157', '#FFCA28', '#FF7043', '#8D6E63',
]

export function donutPalette(i: number): string {
  return DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]
}

/**
 * Renders a donut chart using Unicode block characters.
 * The ring is drawn on an ellipse to compensate for terminal char aspect ratio (~2:1).
 */
export function Donut({ slices, width = 22, height = 11, centerLabel }: DonutProps) {
  const total = slices.reduce((s, v) => s + v.value, 0)
  if (total === 0 || slices.length === 0) {
    return <Text color="gray">No data</Text>
  }

  // Center of ellipse
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  // Outer/inner radii — terminal chars are ~2x taller than wide, compensate.
  const rxOuter = (width - 1) / 2
  const ryOuter = (height - 1) / 2
  const rxInner = rxOuter * 0.55
  const ryInner = ryOuter * 0.55

  // Compute cumulative angles for each slice. Start at top (12 o'clock), go clockwise.
  // In standard math, angle=0 is east. To start at north: offset by -π/2.
  // Clockwise: negate angle progression.
  const angles = [] as Array<{ start: number; end: number; color: string }>
  let cumulative = 0
  for (const s of slices) {
    const portion = s.value / total
    angles.push({ start: cumulative, end: cumulative + portion, color: s.color })
    cumulative += portion
  }

  // Build the grid. Each cell: either colored block or space.
  // Use two foreground blocks ▀ (upper-half) to approximate squarer pixels — skip for simplicity.
  const lines: React.ReactNode[] = []
  for (let y = 0; y < height; y++) {
    const cells: React.ReactNode[] = []
    for (let x = 0; x < width; x++) {
      // Normalize to ellipse space
      const nx = (x - cx) / rxOuter
      const ny = (y - cy) / ryOuter
      const distOuter = nx * nx + ny * ny
      const nxi = (x - cx) / rxInner
      const nyi = (y - cy) / ryInner
      const distInner = nxi * nxi + nyi * nyi

      if (distOuter <= 1 && distInner >= 1) {
        // On the ring — find angle
        // atan2: angle from east, range (-π, π]. Convert to clockwise-from-north in [0, 1).
        const theta = Math.atan2(y - cy, x - cx)  // radians from east
        // Rotate so north=0, and make clockwise
        let portion = (theta + Math.PI / 2) / (2 * Math.PI)
        if (portion < 0) portion += 1
        if (portion >= 1) portion -= 1

        const slice = angles.find(a => portion >= a.start && portion < a.end) ?? angles[angles.length - 1]
        cells.push(<Text key={x} color={slice.color}>{'\u2588'}</Text>)
      } else {
        cells.push(<Text key={x}> </Text>)
      }
    }
    lines.push(<Box key={y}>{cells}</Box>)
  }

  // Overlay center label on the middle row if provided
  if (centerLabel) {
    const midRow = Math.floor(height / 2)
    const labelStart = Math.floor((width - centerLabel.length) / 2)
    const oldRow = lines[midRow]
    // Replace middle row with label
    const newCells: React.ReactNode[] = []
    for (let x = 0; x < width; x++) {
      if (x >= labelStart && x < labelStart + centerLabel.length) {
        newCells.push(<Text key={x} color="white" bold>{centerLabel[x - labelStart]}</Text>)
      } else {
        newCells.push(<Text key={x}> </Text>)
      }
    }
    lines[midRow] = <Box key={midRow}>{newCells}</Box>
    // Keep unused var from complaining
    void oldRow
  }

  return <Box flexDirection="column">{lines}</Box>
}

/**
 * Renders a donut + legend (labeled with values and percentages).
 */
interface DonutWithLegendProps {
  slices: DonutSlice[]
  centerLabel?: string
  chartWidth?: number
  chartHeight?: number
}

export function DonutWithLegend({ slices, centerLabel, chartWidth = 22, chartHeight = 11 }: DonutWithLegendProps) {
  const total = slices.reduce((s, v) => s + v.value, 0)
  return (
    <Box>
      <Donut slices={slices} width={chartWidth} height={chartHeight} centerLabel={centerLabel} />
      <Box marginLeft={2} flexDirection="column">
        {slices.map(s => {
          const p = total > 0 ? (s.value / total) * 100 : 0
          return (
            <Box key={s.label}>
              <Text color={s.color}>{'\u25A0'} </Text>
              <Text color="white">{s.label.padEnd(14)}</Text>
              <Text color="gray">{s.value.toLocaleString().padStart(8)}</Text>
              <Text color="gray" dimColor>  {p.toFixed(1)}%</Text>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/**
 * Horizontal stacked bar chart — a single line with proportional colored segments.
 * Much more reliable in terminals than an ASCII donut.
 */
interface StackedBarProps {
  slices: DonutSlice[]
  width?: number
}

export function StackedBar({ slices, width = 50 }: StackedBarProps) {
  const total = slices.reduce((s, v) => s + v.value, 0)
  if (total === 0) return <Text color="gray">No data</Text>

  // Compute integer segment widths that sum to exactly `width`
  const exactWidths = slices.map(s => (s.value / total) * width)
  const floored = exactWidths.map(w => Math.floor(w))
  let remainder = width - floored.reduce((a, b) => a + b, 0)
  // Distribute remainder to segments with largest fractional part
  const fractions = exactWidths.map((w, i) => ({ i, frac: w - floored[i] }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of fractions) {
    if (remainder <= 0) break
    floored[i]++
    remainder--
  }

  return (
    <Box>
      {slices.map((s, i) => (
        floored[i] > 0 ? (
          <Text key={i} color={s.color}>{'\u2588'.repeat(floored[i])}</Text>
        ) : null
      ))}
    </Box>
  )
}

export function StackedBarWithLegend({ slices }: { slices: DonutSlice[] }) {
  const total = slices.reduce((s, v) => s + v.value, 0)
  return (
    <Box flexDirection="column">
      <StackedBar slices={slices} width={50} />
      <Box flexDirection="column" marginTop={1}>
        {slices.map(s => {
          const p = total > 0 ? (s.value / total) * 100 : 0
          const barLen = Math.max(1, Math.round((s.value / total) * 16))
          return (
            <Box key={s.label}>
              <Text color={s.color}>{'\u2588'.repeat(barLen).padEnd(16)}</Text>
              <Text color="white"> {s.label.padEnd(14)}</Text>
              <Text color="gray">{s.value.toLocaleString().padStart(8)}</Text>
              <Text color="gray" dimColor>  {p.toFixed(1)}%</Text>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
