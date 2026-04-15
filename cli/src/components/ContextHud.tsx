import React from 'react'
import { Box, Text } from 'ink'
import { useContextHud } from '../hooks/useContextHud.js'
import type Database from 'better-sqlite3'

export function ContextHud({ db, sessionId }: { db: Database.Database; sessionId?: string }) {
  const { contextUsed, contextLimit, etaTurns, todayCostCents } = useContextHud(db, sessionId)
  const pct = contextLimit > 0 ? Math.round((contextUsed / contextLimit) * 100) : 0
  const color = pct >= 90 ? 'red' : pct >= 75 ? 'yellow' : 'cyan'
  return (
    <Box>
      <Text color={color}>
        ctx {Math.round(contextUsed / 1000)}k/{Math.round(contextLimit / 1000)}k ({pct}%) · ETA {etaTurns ?? '—'} turns · today ${(todayCostCents / 100).toFixed(2)}
      </Text>
    </Box>
  )
}
