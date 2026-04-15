import type Database from 'better-sqlite3'
import type { Tool } from '../types.js'
import { parseFileExtended } from '../parsers/index.js'
import { MessageRecorder } from './message-recorder.js'

export interface BackfillResult {
  messagesInserted: number
  toolCallsInserted: number
}

export async function backfill(db: Database.Database, tool: Tool, path: string): Promise<BackfillResult> {
  const { messages, toolCalls } = await parseFileExtended(tool, path, 0)
  const recorder = new MessageRecorder(db)
  let msgCount = 0
  let tcCount = 0
  const msgIdByKey = new Map<string, number>()

  const tx = db.transaction(() => {
    for (const m of messages) {
      const key = `${m.sessionId}:${m.turnIndex}:${m.role}`
      const res = recorder.recordMessage({
        sessionId: m.sessionId, turnIndex: m.turnIndex, role: m.role, content: m.content,
        inputTokens: m.inputTokens, outputTokens: m.outputTokens,
        cacheRead: m.cacheRead, cacheWrite: m.cacheWrite,
        thinkingTokens: m.thinkingTokens, createdAt: m.createdAt,
      })
      msgIdByKey.set(key, res.id)
      msgCount += 1
    }
    for (const tc of toolCalls) {
      const key = `${tc.sessionId}:${tc.turnIndex}:assistant`
      const messageId = msgIdByKey.get(key)
      if (!messageId) continue
      recorder.recordToolCall({
        messageId,
        sessionId: tc.sessionId,
        turnIndex: tc.turnIndex,
        toolName: tc.toolName,
        argsRaw: tc.argsRaw,
        succeeded: tc.succeeded,
        tokensReturned: tc.tokensReturned,
        createdAt: tc.createdAt,
      })
      tcCount += 1
    }
  })
  tx()
  return { messagesInserted: msgCount, toolCallsInserted: tcCount }
}
