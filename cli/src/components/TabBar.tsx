import React from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import type { TabName } from '../hooks/useTabNavigation.js'
import { TABS, TAB_LABELS } from '../hooks/useTabNavigation.js'

interface TabBarProps { activeTab: TabName }

export function TabBar({ activeTab }: TabBarProps) {
  return (
    <Box marginBottom={1}>
      <Gradient name="vice"><Text bold>{'\u25C6 tokscale'}</Text></Gradient>
      <Text color="gray"> {'\u2502'} </Text>
      {TABS.map((tab, i) => (
        <React.Fragment key={tab}>
          {i > 0 && <Text color="gray">  </Text>}
          {tab === activeTab ? (
            <Text color="white" bold underline>{TAB_LABELS[tab]}</Text>
          ) : (
            <Text color="gray">{TAB_LABELS[tab]}</Text>
          )}
        </React.Fragment>
      ))}
    </Box>
  )
}
