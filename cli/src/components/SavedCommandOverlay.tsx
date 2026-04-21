import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { scaffoldSlashCommand } from '../services/slash-command-writer.js'
import { DetectionsRepo } from '../db/repository.js'

interface Candidate { id: number; prefix: string }

function loadCandidates(db: Database.Database): Candidate[] {
  const rows = db.prepare(`
    SELECT id, metadata_json FROM detections
    WHERE rule_id = 'B9_prompt_pattern' AND acknowledged_at IS NULL
    ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{ id: number; metadata_json: string }>
  return rows
    .map(r => ({ id: r.id, prefix: (JSON.parse(r.metadata_json || '{}').prefix ?? '') as string }))
    .filter(c => c.prefix.length > 0)
}

export function SavedCommandOverlay({ db, onClose }: { db: Database.Database; onClose: () => void }) {
  const [items, setItems] = React.useState(loadCandidates(db))
  const [cursor, setCursor] = React.useState(0)
  const [status, setStatus] = React.useState('')
  useInput((input, key) => {
    if (key.escape) onClose()
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(items.length - 1, c + 1))
    if (input === 's' && items[cursor]) {
      try {
        const out = scaffoldSlashCommand(items[cursor].prefix)
        new DetectionsRepo(db).acknowledge(items[cursor].id)
        setStatus(`Wrote ${out.relativePath}`)
        const next = items.filter((_, i) => i !== cursor)
        setItems(next)
        setCursor(c => Math.min(c, Math.max(0, next.length - 1)))
      } catch (err) {
        setStatus(`Failed: ${(err as Error).message}`)
      }
    }
  })
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold>Slash-command candidates — s save · ↑/↓ navigate · esc close</Text>
      {items.length === 0
        ? <Text dimColor>Nothing to save.</Text>
        : items.map((c, i) => (
          <Text key={c.id} inverse={i === cursor}>• {c.prefix}</Text>
        ))}
      {status ? <Text dimColor>{status}</Text> : null}
    </Box>
  )
}
