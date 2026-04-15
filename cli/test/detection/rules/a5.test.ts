import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { a5RetryFailureWaste } from '../../../src/detection/rules/a5-retry-failure-waste.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a5-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A5 retry/failure waste', () => {
  it('null below threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'PostToolUse', sessionId: 'S', timestamp: 1,
      thresholds: { min_failed_calls: 3, tokens_floor: 100 }, hardBlockEnabled: false, now: () => 1,
    }
    expect(await a5RetryFailureWaste.evaluate(ctx)).toBeNull()
  })
  it('fires when failed calls exceed threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 1 })
    const tc = new ToolCallsRepo(db)
    for (let i = 0; i < 4; i++) tc.insert({ messageId: msg.id!, sessionId: 'S', toolName: 'Bash', argsHash: `h${i}`, succeeded: 0, tokensReturned: 300, createdAt: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'PostToolUse', sessionId: 'S', timestamp: 1,
      thresholds: { min_failed_calls: 3, tokens_floor: 100 }, hardBlockEnabled: false, now: () => 1,
    }
    const det = await a5RetryFailureWaste.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect((det?.metadata?.failedCalls as number)).toBe(4)
  })
})
