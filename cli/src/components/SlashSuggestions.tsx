import React from 'react'
import { Box, Text } from 'ink'
import type { SlashCommand } from '../commands.js'

interface Props {
  commands: SlashCommand[]
  selected: number
}

/** Claude-Code-style command palette shown while typing a `/` command.
 *  ↑/↓ to move · Tab to complete · Enter to run · Esc to cancel. */
export function SlashSuggestions({ commands, selected }: Props) {
  if (commands.length === 0) {
    return (
      <Box paddingX={1} borderStyle="round" borderColor="#2a3040">
        <Text color="gray" dimColor>no matching command — Esc to cancel</Text>
      </Box>
    )
  }
  const MAX = 8
  const shown = commands.slice(0, MAX)
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="round" borderColor="#2a3040">
      {shown.map((c, i) => {
        const active = i === selected
        return (
          <Box key={c.name}>
            <Text color={active ? 'black' : 'cyan'} backgroundColor={active ? 'cyan' : undefined} bold>
              {` /${c.name} `}
            </Text>
            {c.hint && <Text color="#FFC107"> {c.hint}</Text>}
            <Text color="gray" dimColor>{'  '}{c.desc}</Text>
          </Box>
        )
      })}
      <Box marginTop={shown.length > 0 ? 0 : 0}>
        <Text color="gray" dimColor>
          {commands.length > MAX ? `+${commands.length - MAX} more · ` : ''}↑/↓ move · Tab complete · Enter run · Esc cancel
        </Text>
      </Box>
    </Box>
  )
}
