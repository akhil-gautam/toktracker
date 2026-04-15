import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../src/db/repository.js'
import { RedactionRulesRepo } from '../../src/redaction/repository.js'
import { MessageRecorder } from '../../src/capture/message-recorder.js'

const tmp = join(tmpdir(), `tokscale-recorder-${Date.now()}.db`)
beforeEach(() => { const db = getDb(tmp); migrate(db); new RedactionRulesRepo(db).seedBuiltins() })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('MessageRecorder', () => {
  it('records a message with redacted content + hash', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's1', tool: 'claude_code', model: 'm', startedAt: 1 })
    const r = new MessageRecorder(db)
    const result = r.recordMessage({
      sessionId: 's1', turnIndex: 0, role: 'user',
      content: 'please use my ghp_abcdefghijklmnopqrstuvwxyz0123456789 token',
      createdAt: new Date(2),
    })
    expect(result.contentHash).toHaveLength(64)
    const rows = new MessagesRepo(db).findBySession('s1')
    expect(rows[0].contentRedacted).toContain('[REDACTED_GH_TOKEN]')
  })

  it('records tool call with hashed normalized args', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's2', tool: 'claude_code', model: 'm', startedAt: 1 })
    const r = new MessageRecorder(db)
    const msg = r.recordMessage({ sessionId: 's2', turnIndex: 0, role: 'assistant', content: 'using tool', createdAt: new Date(2) })
    const tc = r.recordToolCall({
      messageId: msg.id, sessionId: 's2', turnIndex: 0,
      toolName: 'Read', argsRaw: { file_path: '/x.ts', other: 1 }, createdAt: new Date(3),
    })
    expect(tc.argsHash).toHaveLength(64)
    const dup = r.recordToolCall({
      messageId: msg.id, sessionId: 's2', turnIndex: 0,
      toolName: 'Read', argsRaw: { other: 1, file_path: '/x.ts' }, createdAt: new Date(4),
    })
    expect(dup.argsHash).toBe(tc.argsHash)
    expect(new ToolCallsRepo(db).findBySessionToolArgs('s2', 'Read', tc.argsHash).length).toBe(2)
  })
})
