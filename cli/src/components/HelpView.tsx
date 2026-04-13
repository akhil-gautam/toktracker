import React from 'react'
import { Box, Text } from 'ink'

interface HelpViewProps { serverMode: boolean }

const LOCAL_COMMANDS = [
  { cmd: '/dashboard', desc: 'Overview dashboard (default)' },
  { cmd: '/repos', desc: 'Cost grouped by git repository' },
  { cmd: '/models', desc: 'Detailed model breakdown' },
  { cmd: '/sessions', desc: 'Recent session list' },
  { cmd: '/timeline', desc: 'Day-by-day cost timeline' },
  { cmd: '/budget', desc: 'Budget status' },
  { cmd: '/budget set', desc: 'Set a new budget' },
  { cmd: '/help', desc: 'Show this help' },
]

const SERVER_COMMANDS = [
  { cmd: '/login', desc: 'Authenticate with server' },
  { cmd: '/push', desc: 'Sync sessions to server' },
  { cmd: '/watch', desc: 'Continuous sync loop' },
  { cmd: '/team', desc: 'Team member breakdown' },
  { cmd: '/anomalies', desc: 'Recent anomaly alerts' },
]

export function HelpView({ serverMode }: HelpViewProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Available Commands</Text></Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray" dimColor>Local:</Text>
        {LOCAL_COMMANDS.map(c => (
          <Box key={c.cmd} gap={2}><Text color="#7C6FE0">{c.cmd.padEnd(16)}</Text><Text color="gray">{c.desc}</Text></Box>
        ))}
      </Box>
      {serverMode && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" dimColor>Server:</Text>
          {SERVER_COMMANDS.map(c => (
            <Box key={c.cmd} gap={2}><Text color="#E8A838">{c.cmd.padEnd(16)}</Text><Text color="gray">{c.desc}</Text></Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color="gray">Press </Text><Text color="white">Esc</Text>
        <Text color="gray"> to return to dashboard, </Text><Text color="white">q</Text><Text color="gray"> to quit</Text>
      </Box>
    </Box>
  )
}
