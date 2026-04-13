import React from 'react'
import { Box, Text } from 'ink'
import type { Session } from '../types.js'
import { formatCost, getModelColor, TOOL_LABELS, formatTokens } from '../theme.js'

interface SessionListProps { sessions: Session[] }

export function SessionList({ sessions }: SessionListProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Recent Sessions</Text><Text color="gray"> ({sessions.length})</Text></Box>
      {sessions.length === 0 && <Text color="gray">No sessions found.</Text>}
      {sessions.length > 0 && (
        <Box><Text color="gray" dimColor>{'Time'.padEnd(8)}{'Tool'.padEnd(14)}{'Model'.padEnd(26)}{'Tokens'.padEnd(10)}{'Cost'.padStart(8)}</Text></Box>
      )}
      {sessions.map(s => {
        const time = s.startedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        const toolLabel = (TOOL_LABELS[s.tool] ?? s.tool).padEnd(14)
        const modelName = (s.model.length > 24 ? s.model.slice(0, 21) + '...' : s.model).padEnd(26)
        return (
          <Box key={s.id}>
            <Text color="gray">{time.padEnd(8)}</Text><Text color="white">{toolLabel}</Text>
            <Text color={getModelColor(s.model)}>{modelName}</Text>
            <Text color="gray">{formatTokens(s.inputTokens + s.outputTokens).padEnd(10)}</Text>
            <Text color="white" bold>{formatCost(s.costMillicents).padStart(8)}</Text>
            {s.estimated && <Text color="yellow"> ~</Text>}
          </Box>
        )
      })}
      <Box marginTop={1}><Text color="gray" dimColor>~ = estimated tokens (Gemini CLI)</Text></Box>
    </Box>
  )
}
