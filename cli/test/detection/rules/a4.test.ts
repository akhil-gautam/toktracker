import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { a4ModelMismatch } from '../../../src/detection/rules/a4-model-mismatch.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a4-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A4 model mismatch', () => {
  it('flags Opus session dominated by trivial Read/Edit calls', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 1 })
    const tc = new ToolCallsRepo(db)
    for (let i = 0; i < 10; i++) tc.insert({ messageId: msg.id!, sessionId: 'S', toolName: i < 5 ? 'Read' : 'Edit', argsHash: `h${i}`, createdAt: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'S', timestamp: 1,
      thresholds: { trivial_ratio_pct: 80, min_tool_calls: 5 }, hardBlockEnabled: false, now: () => 1,
    }
    const det = await a4ModelMismatch.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect(det?.suggestedAction?.kind).toBe('switch_model')
  })
})
