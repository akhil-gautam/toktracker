import Database from 'better-sqlite3'
import type { Session, ParseResult, ExtendedParseResult, ParsedMessage, ParsedToolCall } from '../types.js'

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

export async function parseOpencodeExtended(dbFile: string, sinceMs: number): Promise<ExtendedParseResult> {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true })
  try {
    const sessions: Session[] = []
    const messages: ParsedMessage[] = []
    const toolCalls: ParsedToolCall[] = []

    const msgRows = db.prepare(`SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at`).all(sinceMs) as any[]
    for (const r of msgRows) {
      messages.push({
        sessionId: r.session_id,
        turnIndex: r.turn_index ?? 0,
        role: (r.role === 'user' ? 'user' : 'assistant'),
        content: r.content ?? '',
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        createdAt: new Date(r.created_at),
      })
    }
    const tcRows = db.prepare(`SELECT * FROM tool_calls WHERE created_at >= ? ORDER BY created_at`).all(sinceMs) as any[]
    for (const r of tcRows) {
      toolCalls.push({
        sessionId: r.session_id,
        turnIndex: r.turn_index ?? 0,
        toolName: r.tool_name,
        argsRaw: r.args ? JSON.parse(r.args) : {},
        succeeded: !!r.succeeded,
        createdAt: new Date(r.created_at),
      })
    }

    // best-effort: real opencode DB may not have the legacy message/session schema
    try {
      const base = await parseOpenCode(dbFile, sinceMs)
      sessions.push(...base.sessions)
    } catch { /* ignore - fixture may only have messages/tool_calls tables */ }
    return { sessions, newOffset: Date.now(), messages, toolCalls }
  } finally {
    db.close()
  }
}
