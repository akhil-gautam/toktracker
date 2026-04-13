import React from 'react'
import { Box, Text } from 'ink'

interface HelpOverlayProps { serverMode: boolean }

const KEYS = [
  { key: '\u2190 \u2192', desc: 'Switch tabs' },
  { key: '1-6', desc: 'Jump to tab' },
  { key: '\u2191 \u2193 / j k', desc: 'Navigate lists' },
  { key: 'Enter', desc: 'Expand/collapse row' },
  { key: 'c t s n', desc: 'Sort (Models/Repos tab)' },
  { key: '/', desc: 'Command mode' },
  { key: '?', desc: 'Toggle this help' },
  { key: 'q', desc: 'Quit' },
]

const COMMANDS = [
  { cmd: '/budget set', desc: 'Create or edit a budget' },
]

const SERVER_COMMANDS = [
  { cmd: '/login', desc: 'Authenticate with server' },
  { cmd: '/push', desc: 'Sync sessions to server' },
  { cmd: '/watch', desc: 'Continuous sync loop' },
]

export function HelpOverlay({ serverMode }: HelpOverlayProps) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Keyboard Shortcuts</Text>
      </Box>
      {KEYS.map(k => (
        <Box key={k.key} gap={2}>
          <Text color="#7C6FE0">{k.key.padEnd(14)}</Text>
          <Text color="gray">{k.desc}</Text>
        </Box>
      ))}
      <Box marginTop={1} marginBottom={1}>
        <Text color="cyan" bold>Commands</Text>
      </Box>
      {COMMANDS.map(c => (
        <Box key={c.cmd} gap={2}>
          <Text color="#E8A838">{c.cmd.padEnd(14)}</Text>
          <Text color="gray">{c.desc}</Text>
        </Box>
      ))}
      {serverMode && (
        <>
          <Box marginTop={1} marginBottom={0}>
            <Text color="gray" dimColor>Server:</Text>
          </Box>
          {SERVER_COMMANDS.map(c => (
            <Box key={c.cmd} gap={2}>
              <Text color="#E8A838">{c.cmd.padEnd(14)}</Text>
              <Text color="gray">{c.desc}</Text>
            </Box>
          ))}
        </>
      )}
      <Box marginTop={1}>
        <Text color="gray">Press </Text><Text color="white">?</Text><Text color="gray"> or </Text><Text color="white">Esc</Text><Text color="gray"> to close</Text>
      </Box>
    </Box>
  )
}
