import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import type { SessionStore } from '../services/session-store.js'

export type ActivityRange = 'ALL' | '30D' | '7D'

interface YearCell { value: number; isFuture: boolean }

interface Stats {
  sessions: number
  messages: number
  totalTokens: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  peakHour: number | null
  favoriteModel: string | null
  yearCells: YearCell[]   // Jan 1 → Dec 31 of current year
}

function heatmapDaysFor(range: ActivityRange): number {
  switch (range) {
    case 'ALL': return 140
    case '30D': return 30
    case '7D': return 7
  }
}

function cutoffMs(range: ActivityRange): number {
  if (range === 'ALL') return 0
  const days = range === '30D' ? 30 : 7
  return Date.now() - days * 86_400_000
}

function buildYearCells(db: Database.Database): YearCell[] {
  const now = new Date()
  const year = now.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const nextJan1 = new Date(year + 1, 0, 1)
  const today = new Date(year, now.getMonth(), now.getDate())

  const rows = db.prepare(`
    SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') AS d,
           COALESCE(SUM(cost_millicents), 0) AS c
    FROM sessions WHERE started_at >= ? AND started_at < ?
    GROUP BY d
  `).all(jan1.getTime(), nextJan1.getTime()) as Array<{ d: string; c: number }>
  const byDay = new Map<string, number>()
  for (const r of rows) byDay.set(r.d, r.c)

  const cells: YearCell[] = []
  const cursor = new Date(jan1)
  while (cursor < nextJan1) {
    const key = cursor.toISOString().slice(0, 10)
    const isFuture = cursor.getTime() > today.getTime()
    cells.push({
      value: isFuture ? 0 : (byDay.get(key) ?? 0),
      isFuture,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return cells
}

function compute(db: Database.Database, store: SessionStore, range: ActivityRange): Stats {
  const yearCells = buildYearCells(db)
  const pastCells = yearCells.filter(c => !c.isFuture)
  const windowValues: number[] = (() => {
    if (range === 'ALL') return pastCells.map(c => c.value)
    const days = heatmapDaysFor(range)
    return pastCells.map(c => c.value).slice(-days)
  })()

  const activeDays = windowValues.filter(v => v > 0).length
  const currentStreak = currentStreakOf(pastCells.map(c => c.value))
  const longestStreak = longestStreakOf(yearCells.map(c => c.value))

  const cutoff = cutoffMs(range)
  const sessions = (db.prepare(`
    SELECT COUNT(DISTINCT id) AS c FROM sessions WHERE started_at >= ?
  `).get(cutoff) as { c: number }).c
  const messages = (db.prepare(`
    SELECT COUNT(*) AS c FROM messages WHERE created_at >= ?
  `).get(cutoff) as { c: number }).c
  const tokens = (db.prepare(`
    SELECT COALESCE(SUM(input_tokens + output_tokens + cache_read + cache_write), 0) AS t
    FROM sessions WHERE started_at >= ?
  `).get(cutoff) as { t: number }).t

  const peakRow = db.prepare(`
    SELECT CAST((started_at / 1000) % 86400 / 3600 AS INTEGER) AS h,
           SUM(cost_millicents) AS cost
    FROM sessions WHERE started_at >= ? GROUP BY h ORDER BY cost DESC LIMIT 1
  `).get(cutoff) as { h: number } | undefined
  const peakHour = peakRow?.h ?? null

  const favRow = db.prepare(`
    SELECT model FROM sessions WHERE started_at >= ?
    GROUP BY model ORDER BY SUM(cost_millicents) DESC LIMIT 1
  `).get(cutoff) as { model: string } | undefined
  const favoriteModel = favRow?.model ?? null

  return {
    sessions, messages, totalTokens: tokens,
    activeDays, currentStreak, longestStreak,
    peakHour, favoriteModel,
    yearCells,
  }
}

function currentStreakOf(daily: number[]): number {
  let count = 0
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i]! > 0) count++
    else break
  }
  return count
}

function longestStreakOf(daily: number[]): number {
  let best = 0, cur = 0
  for (const v of daily) {
    if (v > 0) { cur++; best = Math.max(best, cur) }
    else cur = 0
  }
  return best
}

function formatTokens(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

function formatHour(h: number | null): string {
  if (h == null) return '—'
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function shortModel(m: string | null): string {
  if (!m) return '—'
  const trimmed = m.replace(/^claude-/, '').replace(/^gpt-/, '')
  const parts = trimmed.split('-')
  if (parts.length >= 2) {
    const head = parts[0]!
    const rest = parts.slice(1, 3).join('.')
    return `${head.charAt(0).toUpperCase() + head.slice(1)} ${rest}`
  }
  return trimmed
}

function mobyDickFact(tokens: number): string {
  if (tokens <= 0) return '—'
  const mobyDick = 210_000
  const ratio = tokens / mobyDick
  if (ratio < 1) return `≈ ${Math.round(ratio * 100)}% of Moby-Dick.`
  return `You've used ~${Math.round(ratio)}× more tokens than Moby-Dick.`
}

// Four-stop ramp using Unicode block chars. Chalk-via-Ink color prop gives
// the visual intensity in a terminal without requiring truecolor.
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

/// GitHub-style contribution grid. Column 0, row 0 is the Monday of the week
/// containing Jan 1 — days before Jan 1 render as blanks so the grid stays
/// rectangular.
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" width={20} marginRight={1}>
      <Text dimColor>{label.toUpperCase()}</Text>
      <Text bold>{value}</Text>
    </Box>
  )
}

interface Props { db: Database.Database; store: SessionStore }

export function ActivityHero({ db, store }: Props) {
  const [range, setRange] = React.useState<ActivityRange>('ALL')
  useInput(input => {
    if (input === 'a' || input === 'A') setRange('ALL')
    else if (input === '3') setRange('30D')
    else if (input === '7') setRange('7D')
  })
  const stats = React.useMemo(() => compute(db, store, range), [db, store, range])
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
        <Stat label="Sessions"       value={String(stats.sessions)} />
        <Stat label="Messages"       value={formatTokens(stats.messages)} />
        <Stat label="Total tokens"   value={formatTokens(stats.totalTokens)} />
        <Stat label="Active days"    value={String(stats.activeDays)} />
      </Box>
      <Box>
        <Stat label="Current streak" value={`${stats.currentStreak}d`} />
        <Stat label="Longest streak" value={`${stats.longestStreak}d`} />
        <Stat label="Peak hour"      value={formatHour(stats.peakHour)} />
        <Stat label="Favorite model" value={shortModel(stats.favoriteModel)} />
      </Box>
      <Box marginTop={1}>
        <Heatmap cells={stats.yearCells} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{mobyDickFact(stats.totalTokens)}</Text>
      </Box>
    </Box>
  )
}
