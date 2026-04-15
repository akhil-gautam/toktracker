import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { useRules } from '../hooks/useRules.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'

const registry = new RuleRegistry()
registerAllRules(registry)

export function RulesTab({ db }: { db: Database.Database }) {
  const { rows, toggle, setHardBlock } = useRules(db, registry.all())
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(rows.length - 1, c + 1))
    if (input === ' ') toggle(rows[cursor].id)
    if (input === 'b') setHardBlock(rows[cursor].id, !rows[cursor].hardBlock)
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Rules (space toggle, b hard-block)</Text>
      {rows.map((r, i) => (
        <Text key={r.id} inverse={i === cursor}>
          {r.enabled ? '●' : '○'} [{r.category}] {r.id} {r.hardBlock ? '[BLOCK]' : ''} — {Object.entries(r.thresholds).map(([k, v]) => `${k}=${v}`).join(' ')}
        </Text>
      ))}
    </Box>
  )
}
