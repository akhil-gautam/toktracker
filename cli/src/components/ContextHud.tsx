import React from 'react'
import { Box, Text } from 'ink'
import { formatCost } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

/**
 * Header spend readout. Sourced from the in-memory SessionStore (the CLI is a
 * dashboard over historical logs — there is no live "context window"/"ETA", which
 * is why the old DB-backed ctx/ETA always read 0). Shows today / week / all-time.
 */
export function ContextHud({ store }: { store: SessionStore }) {
  const today = store.getTodayStats().costMillicents
  const week = store.getWeekTotal()
  const allTime = store.getAllTimeStats().costMillicents
  return (
    <Box>
      <Text color="gray">today </Text>
      <Text color="#4CAF50" bold>{formatCost(today)}</Text>
      <Text color="gray">  ·  7d </Text>
      <Text color="#64B5F6" bold>{formatCost(week)}</Text>
      <Text color="gray">  ·  all-time </Text>
      <Text bold>{formatCost(allTime)}</Text>
    </Box>
  )
}
