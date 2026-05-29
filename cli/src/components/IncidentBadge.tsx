import React from 'react'
import { Box, Text } from 'ink'
import { loadStatusCache, activeIncidents, type StatusIndicator } from '../services/status-probe.js'

const COLOR: Record<StatusIndicator, string> = {
  critical: '#FF5252', major: '#FF5252', minor: '#FFC107', none: '#4CAF50', unknown: 'gray',
}

/**
 * Provider-incident badge for the header. Reads the daemon-written status cache
 * (no network from the TUI). Renders nothing unless an incident is active — so it
 * stays invisible for the common all-operational case and when polling is off.
 */
export function IncidentBadge() {
  const incidents = activeIncidents(loadStatusCache())
  if (incidents.length === 0) return null
  const worst = incidents[0]!
  // Terse so it never crowds the tab bar — full detail lives in `status show`.
  const label = incidents.length === 1 ? worst.provider : `${incidents.length} providers`
  return (
    <Box marginRight={2}>
      <Text color={COLOR[worst.indicator]} bold>{'⚠ '}{label}</Text>
    </Box>
  )
}
