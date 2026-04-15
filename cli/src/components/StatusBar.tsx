import React from 'react'
import { Box, Text } from 'ink'
import type { TabName } from '../hooks/useTabNavigation.js'

interface StatusBarProps {
  tab: TabName
  commandMode?: boolean
  commandInput?: string
}

const TAB_HINTS: Record<TabName, string> = {
  overview: '? help  q quit  / command  1-0 tabs  \u2190\u2192 switch tab  ! CLAUDE.md  @ saved-cmd',
  models: '\u2191\u2193 navigate  Enter expand  c/t/s/n sort  ? help  q quit',
  daily: '? help  q quit  1-0 tabs',
  repos: '\u2191\u2193 navigate  Enter expand  ? help  q quit',
  budget: '? help  q quit  /budget set  1-0 tabs',
  sessions: '\u2191\u2193 scroll  ? help  q quit',
  insights: '\u2191\u2193/j/k navigate  a acknowledge  ? help  q quit',
  rules: '\u2191\u2193/j/k navigate  space toggle  b hard-block  ? help  q quit',
  attribution: '? help  q quit',
  hooks: 'i install global  u uninstall global  I install local  U uninstall local  ? help  q quit',
}

export function StatusBar({ tab, commandMode, commandInput }: StatusBarProps) {
  if (commandMode) {
    return (
      <Box>
        <Text color="cyan" bold>{'> '}</Text>
        <Text color="white">{commandInput}</Text>
        <Text color="gray">{'\u2588'}</Text>
      </Box>
    )
  }

  return (
    <Box>
      <Text color="gray" dimColor>{TAB_HINTS[tab]}</Text>
    </Box>
  )
}
