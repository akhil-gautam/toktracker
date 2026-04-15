import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { c11PreflightCost } from '../../../src/detection/rules/c11-preflight-cost.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-c11-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('C11 preflight cost', () => {
  it('returns info detection with cost range when prompt present', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-sonnet-4-6', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 3; i++) m.insert({ sessionId: 'S', turnIndex: i, role: 'assistant', contentHash: 'h', inputTokens: 30000, outputTokens: 1500, createdAt: i })
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'S', userPrompt: 'hello world',
      timestamp: 10, thresholds: { min_cost_cents: 1 }, hardBlockEnabled: false, now: () => 10,
    }
    const det = await c11PreflightCost.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.metadata?.estLowCents).toBeDefined()
    expect(det?.metadata?.estHighCents).toBeDefined()
  })
})
