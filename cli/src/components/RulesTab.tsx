import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { useRules } from '../hooks/useRules.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'

const registry = new RuleRegistry()
registerAllRules(registry)

export function RulesTab({ db }: { db: Database.Database }) {
  const { rows, toggle, setHardBlock, setThreshold } = useRules(db, registry.all())
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(rows.length - 1, c + 1))
    if (input === ' ') toggle(rows[cursor].id)
    if (input === 'b') setHardBlock(rows[cursor].id, !rows[cursor].hardBlock)
    if (input === '+' || input === '-') {
      const rule = rows[cursor]
      if (!rule) return
      const keys = Object.keys(rule.thresholds)
      if (keys.length === 0) return
      const firstKey = keys[0]
      const current = rule.thresholds[firstKey]
      const step = Math.max(1, Math.round(current * 0.1))
      const next = input === '+' ? current + step : Math.max(0, current - step)
      setThreshold(rule.id, firstKey, next)
    }
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Rules (space toggle, b hard-block, +/- adjust threshold)</Text>
      {rows.map((r, i) => (
        <Text key={r.id} inverse={i === cursor}>
          {r.enabled ? '●' : '○'} [{r.category}] {r.id} {r.hardBlock ? '[BLOCK]' : ''} — {Object.entries(r.thresholds).map(([k, v]) => `${k}=${v}`).join(' ')}
        </Text>
      ))}
    </Box>
  )
}
