import type Database from 'better-sqlite3'

export interface PurgeResult {
  messages: number
  toolCalls: number
  hookEvents: number
}

export function purge(db: Database.Database, retentionDays: number): PurgeResult {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const m = db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff)
  const t = db.prepare('DELETE FROM tool_calls WHERE created_at < ?').run(cutoff)
  const h = db.prepare('DELETE FROM hook_events WHERE created_at < ?').run(cutoff)
  db.exec('VACUUM')
  return { messages: m.changes, toolCalls: t.changes, hookEvents: h.changes }
}
