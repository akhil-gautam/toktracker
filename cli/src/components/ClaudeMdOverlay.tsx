import React from 'react'
import { Box, Text, useInput } from 'ink'
import { writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

interface Suggestion { id: number; text: string }

function loadSuggestions(db: Database.Database): Suggestion[] {
  const rows = db.prepare(`
    SELECT id, summary, suggested_action_json FROM detections
    WHERE suggested_action_json IS NOT NULL AND suggested_action_json LIKE '%claude_md_edit%'
    ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{ id: number; summary: string; suggested_action_json: string }>
  return rows.map(r => ({ id: r.id, text: r.summary }))
}

export function ClaudeMdOverlay({ db, onClose }: { db: Database.Database; onClose: () => void }) {
  const [items, setItems] = React.useState<Suggestion[]>(loadSuggestions(db))
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.escape) onClose()
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(items.length - 1, c + 1))
    if (input === 'a' && items[cursor]) {
      const path = join(process.cwd(), 'CLAUDE.md')
      const line = `\n- ${items[cursor].text}\n`
      if (existsSync(path)) appendFileSync(path, line)
      else writeFileSync(path, `# Project notes\n${line}`)
      setItems(items.filter((_, i) => i !== cursor))
      setCursor(c => Math.max(0, c - 1))
    }
  })
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold>CLAUDE.md suggestions (a apply, esc close)</Text>
      {items.length === 0 ? <Text dimColor>Nothing to apply.</Text> : items.map((s, i) => (
        <Text key={s.id} inverse={i === cursor}>• {s.text}</Text>
      ))}
    </Box>
  )
}
