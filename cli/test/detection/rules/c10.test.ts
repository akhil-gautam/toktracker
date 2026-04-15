import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { c10ContextWindowEta } from '../../../src/detection/rules/c10-context-window-eta.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-c10-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('C10 context-window ETA', () => {
  it('fires when extrapolated turns to ceiling <= threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 4; i++) m.insert({ sessionId: 'S', turnIndex: i, role: 'assistant', contentHash: 'h', inputTokens: 40000, outputTokens: 2000, createdAt: i })
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'S', timestamp: 10,
      thresholds: { warn_turns: 10 }, hardBlockEnabled: false, now: () => 10,
    }
    const det = await c10ContextWindowEta.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect(det?.metadata?.etaTurns).toBeDefined()
  })
})
