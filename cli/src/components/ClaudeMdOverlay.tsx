import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { appendHotPath, appendCorrection } from '../services/claude-md-updater.js'
import { DetectionsRepo } from '../db/repository.js'

interface Suggestion {
  id: number
  ruleId: string
  text: string
  action: { kind: string; payload?: Record<string, unknown> }
}

function loadSuggestions(db: Database.Database): Suggestion[] {
  const rows = db.prepare(`
    SELECT id, rule_id, summary, suggested_action_json FROM detections
    WHERE suggested_action_json IS NOT NULL
      AND suggested_action_json LIKE '%claude_md_edit%'
      AND acknowledged_at IS NULL
    ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{ id: number; rule_id: string; summary: string; suggested_action_json: string }>
  return rows.map(r => {
    let action: Suggestion['action'] = { kind: 'claude_md_edit' }
    try { action = JSON.parse(r.suggested_action_json) } catch { /* best-effort */ }
    return { id: r.id, ruleId: r.rule_id, text: r.summary, action }
  })
}

/// Apply a claude_md_edit suggestion. B8 expects a `path` payload and writes
/// a per-repo hot-paths block; B7 expects a correction phrase and writes a
/// rule to the global `~/.claude/CLAUDE.md`. Returns the written path (for
/// display) or throws on failure.
function applyAction(s: Suggestion): string {
  const p = s.action.payload ?? {}
  if (s.ruleId === 'B8_file_reopen' && typeof p['path'] === 'string') {
    const sessions = typeof p['sessions'] === 'number' ? (p['sessions'] as number) : 3
    return appendHotPath(p['path'] as string, sessions).relativePath
  }
  if (s.ruleId === 'B7_correction_graph') {
    const phrase = (typeof p['phrase'] === 'string' ? p['phrase']
                  : typeof p['text'] === 'string' ? (p['text'] as string).slice(0, 48)
                  : null)
    if (!phrase) throw new Error('No correction phrase on detection payload')
    return appendCorrection(phrase).relativePath
  }
  throw new Error(`Unhandled rule: ${s.ruleId}`)
}

export function ClaudeMdOverlay({ db, onClose }: { db: Database.Database; onClose: () => void }) {
  const [items, setItems] = React.useState<Suggestion[]>(loadSuggestions(db))
  const [cursor, setCursor] = React.useState(0)
  const [status, setStatus] = React.useState<string>('')
  useInput((input, key) => {
    if (key.escape) onClose()
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(items.length - 1, c + 1))
    if (input === 'a' && items[cursor]) {
      try {
        const where = applyAction(items[cursor])
        new DetectionsRepo(db).acknowledge(items[cursor].id)
        setStatus(`Wrote ${where}`)
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
      <Text bold>CLAUDE.md suggestions — a apply · ↑/↓ navigate · esc close</Text>
      {items.length === 0
        ? <Text dimColor>Nothing to apply.</Text>
        : items.map((s, i) => (
          <Text key={s.id} inverse={i === cursor}>
            • [{s.ruleId}] {s.text}
          </Text>
        ))}
      {status ? <Text dimColor>{status}</Text> : null}
    </Box>
  )
}
