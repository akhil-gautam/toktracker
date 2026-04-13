import Database from 'better-sqlite3'
import type { Session, ParseResult } from '../types.js'

interface OpenCodeMessageData {
  role: string; modelID?: string; providerID?: string; cost?: number
  tokens?: { total: number; input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  time?: { created: number; completed?: number }
}

interface MessageRow {
  id: string; session_id: string; time_created: number; data: string; directory: string | null
}

export async function parseOpenCode(dbPath: string, fromOffset: number): Promise<ParseResult> {
  let db: InstanceType<typeof Database>
  try { db = new Database(dbPath, { readonly: true }) }
  catch { return { sessions: [], newOffset: fromOffset } }

  try {
    const rows = db.prepare(`
      SELECT m.id, m.session_id, m.time_created, m.data, s.directory
      FROM message m JOIN session s ON s.id = m.session_id
      WHERE m.time_created > ? ORDER BY m.time_created ASC
    `).all(fromOffset) as MessageRow[]

    const sessions: Session[] = []
    let maxTimestamp = fromOffset

    for (const row of rows) {
      let data: OpenCodeMessageData
      try { data = JSON.parse(row.data) } catch { continue }
      if (data.role !== 'assistant' || !data.tokens) continue

      sessions.push({
        id: `oc-${row.id}`, tool: 'opencode',
        model: data.modelID ?? 'unknown', provider: data.providerID ?? 'unknown',
        inputTokens: data.tokens.input, outputTokens: data.tokens.output,
        cacheReadTokens: data.tokens.cache.read, cacheWriteTokens: data.tokens.cache.write,
        reasoningTokens: data.tokens.reasoning,
        costMillicents: data.cost != null ? Math.round(data.cost * 100_000) : 0,
        cwd: row.directory ?? undefined,
        startedAt: new Date(row.time_created),
        endedAt: data.time?.completed ? new Date(data.time.completed) : undefined,
      })
      if (row.time_created > maxTimestamp) maxTimestamp = row.time_created
    }
    return { sessions, newOffset: maxTimestamp }
  } finally { db.close() }
}
