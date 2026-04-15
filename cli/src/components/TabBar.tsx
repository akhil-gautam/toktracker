import React from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import type { TabName } from '../hooks/useTabNavigation.js'
import { TABS, TAB_LABELS } from '../hooks/useTabNavigation.js'

interface TabBarProps { activeTab: TabName; unreadDetections?: number }

export function TabBar({ activeTab, unreadDetections = 0 }: TabBarProps) {
  return (
    <Box marginBottom={1}>
      <Gradient name="vice"><Text bold>{'\u25C6 tokscale'}</Text></Gradient>
      <Text color="gray"> {'\u2502'} </Text>
      {TABS.map((tab, i) => {
        const baseLabel = TAB_LABELS[tab]
        const label = tab === 'insights' && unreadDetections > 0 ? `${baseLabel}(${unreadDetections})` : baseLabel
        return (
          <React.Fragment key={tab}>
            {i > 0 && <Text color="gray">  </Text>}
            {tab === activeTab ? (
              <Text color="white" bold underline>{label}</Text>
            ) : (
              <Text color="gray">{label}</Text>
            )}
          </React.Fragment>
        )
      })}
    </Box>
  )
}
