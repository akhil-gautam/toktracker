import React from 'react'
import { Box, Text, useInput } from 'ink'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

interface Candidate { id: number; prefix: string }

function loadCandidates(db: Database.Database): Candidate[] {
  const rows = db.prepare(`
    SELECT id, metadata_json FROM detections
    WHERE rule_id = 'B9_prompt_pattern' ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{ id: number; metadata_json: string }>
  return rows.map(r => ({ id: r.id, prefix: JSON.parse(r.metadata_json || '{}').prefix ?? '' })).filter(c => c.prefix)
}

export function SavedCommandOverlay({ db, onClose }: { db: Database.Database; onClose: () => void }) {
  const [items, setItems] = React.useState(loadCandidates(db))
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.escape) onClose()
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(items.length - 1, c + 1))
    if (input === 's' && items[cursor]) {
      const name = items[cursor].prefix.split(/\s+/).slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
      const dir = join(process.cwd(), '.claude', 'commands')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${name || 'saved'}.md`), `${items[cursor].prefix}\n`)
      setItems(items.filter((_, i) => i !== cursor))
      setCursor(c => Math.max(0, c - 1))
    }
  })
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold>Saved command candidates (s save, esc close)</Text>
      {items.length === 0 ? <Text dimColor>Nothing to save.</Text> : items.map((c, i) => (
        <Text key={c.id} inverse={i === cursor}>• {c.prefix}</Text>
      ))}
    </Box>
  )
}
