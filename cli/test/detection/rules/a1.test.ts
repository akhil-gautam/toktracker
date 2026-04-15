import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { a1RedundantToolCall } from '../../../src/detection/rules/a1-redundant-tool-call.js'
import type { DetectionContext } from '../../../src/detection/types.js'
import { sha256, normalizeArgs } from '../../../src/capture/hashing.js'

const tmp = join(tmpdir(), `tokscale-a1-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

function makeCtx(overrides: Partial<DetectionContext> = {}): DetectionContext {
  return {
    db: getDb(tmp), trigger: 'PreToolUse', sessionId: 'S', toolName: 'Read',
    toolInput: { file_path: '/x.ts' }, timestamp: 100,
    thresholds: { min_repeat_count: 2 }, hardBlockEnabled: false,
    now: () => 100,
    ...overrides,
  }
}

describe('A1 redundant tool call', () => {
  it('returns null when tool not called before', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    expect(await a1RedundantToolCall.evaluate(makeCtx())).toBeNull()
  })
  it('returns warn when same args_hash already succeeded this session', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 50 })
    const argsHash = sha256(normalizeArgs({ file_path: '/x.ts' }))
    new ToolCallsRepo(db).insert({ messageId: msg.id!, sessionId: 'S', toolName: 'Read', argsHash, succeeded: 1, createdAt: 60 })
    const det = await a1RedundantToolCall.evaluate(makeCtx())
    expect(det?.severity).toBe('warn')
    expect(det?.metadata?.argsHash).toBe(argsHash)
  })
})
