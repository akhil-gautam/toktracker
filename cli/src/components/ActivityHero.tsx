import React from 'react'
import { Box, Text, useInput } from 'ink'
import type { SessionStore, ActivityRange, YearCell } from '../services/session-store.js'
import { formatTokens, shortModel } from '../theme.js'

function formatHour(h: number | null): string {
  if (h == null) return '—'
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

// A rotating pool of "how many of X is that?" comparisons (token estimates are
// rough, just for fun). One is picked at random each time the Overview mounts.
const TOKEN_FACTS: Array<{ name: string; tokens: number }> = [
  { name: 'Moby-Dick', tokens: 320_000 },
  { name: 'War and Peace', tokens: 780_000 },
  { name: 'the King James Bible', tokens: 1_010_000 },
  { name: 'the Lord of the Rings trilogy', tokens: 760_000 },
  { name: 'the Harry Potter series', tokens: 1_500_000 },
  { name: "Hitchhiker's Guide to the Galaxy", tokens: 60_000 },
  { name: 'the original Star Wars trilogy scripts', tokens: 120_000 },
  { name: 'a typical PhD thesis', tokens: 110_000 },
]

function tokenFact(tokens: number, idx: number): string {
  if (tokens <= 0) return '—'
  const f = TOKEN_FACTS[idx % TOKEN_FACTS.length]!
  const ratio = tokens / f.tokens
  if (ratio < 1) return `≈ ${Math.round(ratio * 100)}% of ${f.name} in tokens.`
  if (ratio < 2) return `≈ ${ratio.toFixed(1)}× ${f.name} in tokens.`
  return `~${Math.round(ratio).toLocaleString()}× ${f.name} in tokens.`
}

// Four-stop ramp using Unicode block chars.
function heatmapCell(cell: YearCell | null, peak: number): { char: string; color: string; dim: boolean } {
  if (cell === null) return { char: ' ', color: 'gray', dim: true }
  if (cell.isFuture) return { char: '·', color: 'gray', dim: true }
  if (cell.value <= 0) return { char: '·', color: 'gray', dim: false }
  const ratio = peak > 0 ? cell.value / peak : 0
  if (ratio < 0.25) return { char: '▪', color: 'blueBright', dim: false }
  if (ratio < 0.5)  return { char: '■', color: 'blue', dim: false }
  if (ratio < 0.75) return { char: '■', color: 'cyan', dim: false }
  return { char: '█', color: 'cyanBright', dim: false }
}

/// GitHub-style contribution grid for the current year.
function Heatmap({ cells }: { cells: YearCell[] }) {
  const rows = 7
  const year = new Date().getFullYear()
  const jan1 = new Date(year, 0, 1)
  const jan1Row = (jan1.getDay() + 6) % 7   // Sun=0 → remap to Mon=0
  const total = jan1Row + cells.length
  const cols = Math.max(1, Math.ceil(total / rows))
  const peak = Math.max(1, ...cells.map(c => c.value))

  const lines: React.ReactNode[] = []
  for (let r = 0; r < rows; r++) {
    const rowCells: React.ReactNode[] = []
    for (let c = 0; c < cols; c++) {
      const slot = c * 7 + r
      const idx = slot - jan1Row
      const cell = idx >= 0 && idx < cells.length ? cells[idx]! : null
      const { char, color, dim } = heatmapCell(cell, peak)
      rowCells.push(
        <Text key={c} color={color as any} dimColor={dim}>{char + ' '}</Text>
      )
    }
    lines.push(<Box key={r}>{rowCells}</Box>)
  }
  return <Box flexDirection="column">{lines}</Box>
}

// Each stat is a fixed-width column: label on row 1, value on row 2. The explicit
// width + truncation keeps label and value from ever colliding (the old layout let
// adjacent columns overrun each other on some terminals → "0ESSIONS").
function Stat({ label, value, width }: { label: string; value: string; width: number }) {
  const w = Math.max(8, width - 1)
  const clip = (s: string) => (s.length > w ? s.slice(0, w - 1) + '…' : s)
  return (
    <Box flexDirection="column" width={width}>
      <Text color="#6B7280">{clip(label.toUpperCase())}</Text>
      <Text bold>{clip(value)}</Text>
    </Box>
  )
}

interface Props { store: SessionStore; columns?: number }

export function ActivityHero({ store, columns = 80 }: Props) {
  const [range, setRange] = React.useState<ActivityRange>('ALL')
  // Pick a fun-fact comparison once per mount so it varies between views but
  // doesn't flicker on every re-render.
  const [factIdx] = React.useState(() => Math.floor(Math.random() * TOKEN_FACTS.length))
  useInput(input => {
    if (input === 'a' || input === 'A') setRange('ALL')
    else if (input === '3') setRange('30D')
    else if (input === '7') setRange('7D')
  })
  const stats = React.useMemo(() => store.getActivity(range), [store, range])

  // Four columns sized to the terminal width (panel has border + padding ≈ 4 cols).
  const colWidth = Math.max(14, Math.min(28, Math.floor((columns - 6) / 4)))

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} paddingY={0} marginBottom={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>Overview · Activity</Text>
        <Box>
          {(['ALL', '30D', '7D'] as ActivityRange[]).map(r => (
            <Text key={r} inverse={r === range} color={r === range ? 'cyan' : undefined}>
              {` ${r} `}
            </Text>
          ))}
          <Text dimColor>  (press a / 3 / 7)</Text>
        </Box>
      </Box>
      <Box>
        <Stat label="Sessions"       value={String(stats.sessions)}        width={colWidth} />
        <Stat label="Total tokens"   value={formatTokens(stats.totalTokens)} width={colWidth} />
        <Stat label="Active days"    value={String(stats.activeDays)}      width={colWidth} />
        <Stat label="Current streak" value={`${stats.currentStreak}d`}     width={colWidth} />
      </Box>
      <Box marginTop={1}>
        <Stat label="Longest streak" value={`${stats.longestStreak}d`}     width={colWidth} />
        <Stat label="Peak hour"      value={formatHour(stats.peakHour)}    width={colWidth} />
        <Stat label="Favorite model" value={shortModel(stats.favoriteModel)} width={colWidth} />
        <Stat label="" value="" width={colWidth} />
      </Box>
      <Box marginTop={1}>
        {stats.sessions > 0
          ? <Heatmap cells={stats.yearCells} />
          : <Text dimColor>No activity in this range yet — start a session to see your heatmap.</Text>}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{tokenFact(stats.totalTokens, factIdx)}</Text>
      </Box>
    </Box>
  )
}
