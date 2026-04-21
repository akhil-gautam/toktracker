import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { useScrollableList } from '../hooks/useScrollableList.js'
import { formatCost, formatTokens, getModelColor, getRepoColor } from '../theme.js'
import type { Session } from '../types.js'

interface SessionsTabProps {
  sessions: Session[]
  viewportHeight?: number
}

interface Column {
  label: string
  width: number
  align?: 'left' | 'right'
}

const COLUMNS: Column[] = [
  { label: 'Started · Duration', width: 22 },
  { label: 'Project', width: 22 },
  { label: 'Model', width: 26 },
  { label: 'Input', width: 10, align: 'right' },
  { label: 'Output', width: 10, align: 'right' },
  { label: 'Cache R', width: 10, align: 'right' },
  { label: 'Cache W', width: 10, align: 'right' },
  { label: 'Cost', width: 10, align: 'right' },
]

function fmtStarted(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function fmtDuration(s: Session): string {
  if (!s.endedAt) return '-'
  const ms = s.endedAt.getTime() - s.startedAt.getTime()
  if (ms <= 0) return '-'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  if (m < 60) {
    const r = sec % 60
    return r > 0 ? `${m}m${r}s` : `${m}m`
  }
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h${rm}m` : `${h}h`
}

function pad(s: string, w: number, align: 'left' | 'right' = 'left'): string {
  if (s.length > w) s = s.slice(0, w - 1) + '\u2026'
  return align === 'right' ? s.padStart(w) : s.padEnd(w)
}

export function SessionsTab({ sessions, viewportHeight = 20 }: SessionsTabProps) {
  const { cursor, visibleItems, visibleStartIndex, moveUp, moveDown } = useScrollableList(sessions, viewportHeight)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
  })

  const totalWidth = useMemo(() => COLUMNS.reduce((s, c) => s + c.width, 0) + COLUMNS.length - 1, [])

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">No sessions found.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box>
        <Text color="gray">  </Text>
        {COLUMNS.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Text color="gray" dimColor> </Text>}
            <Text color="gray" dimColor>{pad(c.label, c.width, c.align)}</Text>
          </React.Fragment>
        ))}
      </Box>
      <Box marginBottom={0}>
        <Text color="gray" dimColor>  {'\u2500'.repeat(totalWidth)}</Text>
      </Box>

      {/* Rows */}
      {visibleItems.map((s, i) => {
        const globalIdx = visibleStartIndex + i
        const isCursor = globalIdx === cursor
        const bg = isCursor ? { backgroundColor: '#1e2a3a' } : {}
        const modelColor = getModelColor(s.model)
        const started = fmtStarted(s.startedAt)
        const dur = fmtDuration(s)
        const startedCell = `${started} \u00B7 ${dur}`
        const project = s.gitRepo ?? '-'
        const projectColor = s.gitRepo ? getRepoColor(s.gitRepo) : 'gray'

        return (
          <Box key={s.id} {...bg}>
            <Text color={isCursor ? 'cyan' : 'gray'}>{isCursor ? '\u25B8 ' : '  '}</Text>
            <Text color="gray">{pad(startedCell, COLUMNS[0].width)}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color={projectColor}>{pad(project, COLUMNS[1].width)}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color={modelColor}>{pad(s.model, COLUMNS[2].width)}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color="#64B5F6">{pad(formatTokens(s.inputTokens + s.cacheReadTokens + s.cacheWriteTokens), COLUMNS[3].width, 'right')}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color="#4CAF50">{pad(formatTokens(s.outputTokens), COLUMNS[4].width, 'right')}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color="#FFC107">{pad(formatTokens(s.cacheReadTokens), COLUMNS[5].width, 'right')}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color="#FF9800">{pad(formatTokens(s.cacheWriteTokens), COLUMNS[6].width, 'right')}</Text>
            <Text color="gray" dimColor> </Text>
            <Text color="white" bold>{pad(formatCost(s.costMillicents), COLUMNS[7].width, 'right')}</Text>
            {s.estimated && <Text color="yellow"> ~</Text>}
          </Box>
        )
      })}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          {sessions.length.toLocaleString()} sessions  {'\u00B7'}  showing {visibleStartIndex + 1}{'\u2013'}{Math.min(visibleStartIndex + visibleItems.length, sessions.length)}  {'\u00B7'}  ~ = estimated
        </Text>
      </Box>
    </Box>
  )
}
