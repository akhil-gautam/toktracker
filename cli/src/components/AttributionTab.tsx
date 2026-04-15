import React from 'react'
import { Box, Text } from 'ink'
import type Database from 'better-sqlite3'
import { usePrAttributions } from '../hooks/usePrAttributions.js'

export function AttributionTab({ db }: { db: Database.Database }) {
  const rows = usePrAttributions(db)
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Cost per merged PR</Text>
      {rows.length === 0 ? <Text dimColor>No PR attributions yet.</Text> : rows.map(r => (
        <Text key={`${r.repo}#${r.prNumber}`}>
          {r.repo} PR #{r.prNumber} — ${(r.costCents / 100).toFixed(2)} across {r.sessions} session{r.sessions === 1 ? '' : 's'}
        </Text>
      ))}
    </Box>
  )
}
