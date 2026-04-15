import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { a2ContextBloat } from '../../../src/detection/rules/a2-context-bloat.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a2-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A2 context bloat', () => {
  it('fires when last N assistant turns exceed token ceiling', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 5; i++) {
      m.insert({ sessionId: 'S', turnIndex: i, role: 'assistant', contentHash: `h${i}`, outputTokens: 10_000, createdAt: 1 + i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'S', timestamp: 10,
      thresholds: { window_turns: 5, ceiling_tokens: 40000 }, hardBlockEnabled: false, now: () => 10,
    }
    const det = await a2ContextBloat.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect((det?.metadata?.windowTokens as number)).toBeGreaterThanOrEqual(40000)
  })
})
