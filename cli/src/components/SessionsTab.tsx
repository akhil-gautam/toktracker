import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useScrollableList } from '../hooks/useScrollableList.js'
import { formatCost, formatTokens, getModelColor, TOOL_LABELS } from '../theme.js'
import type { Session } from '../types.js'

interface SessionsTabProps { sessions: Session[] }

export function SessionsTab({ sessions }: SessionsTabProps) {
  const { cursor, visibleItems, visibleStartIndex, moveUp, moveDown } = useScrollableList(sessions, 15)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
  })

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">No sessions found.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={0}>
        <Text color="gray" dimColor>
          {'  Time'.padEnd(10)}{'Tool'.padEnd(14)}{'Model'.padEnd(26)}{'Tokens'.padEnd(10)}{'Cost'.padStart(8)}
        </Text>
      </Box>
      <Box marginBottom={1}><Text color="gray" dimColor>  {'─'.repeat(68)}</Text></Box>
      {visibleItems.map((s, i) => {
        const globalIdx = visibleStartIndex + i
        const isCursor = globalIdx === cursor
        const time = s.startedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        const toolLabel = (TOOL_LABELS[s.tool] ?? s.tool).padEnd(14)
        const modelName = (s.model.length > 24 ? s.model.slice(0, 21) + '...' : s.model).padEnd(26)
        const tokens = formatTokens(s.inputTokens + s.outputTokens).padEnd(10)

        const rowBg = isCursor ? { backgroundColor: '#1e2a3a' } : {}
        return (
          <Box key={s.id} {...rowBg}>
            <Text color={isCursor ? 'cyan' : 'gray'}>{isCursor ? '\u25B8 ' : '  '}</Text>
            <Text color="gray">{time.padEnd(8)}</Text>
            <Text color="white">{toolLabel}</Text>
            <Text color={getModelColor(s.model)}>{modelName}</Text>
            <Text color="gray">{tokens}</Text>
            <Text color="white" bold>{formatCost(s.costMillicents).padStart(8)}</Text>
            {s.estimated && <Text color="yellow"> ~</Text>}
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text color="gray" dimColor>{sessions.length} sessions  ~ = estimated</Text>
      </Box>
    </Box>
  )
}
