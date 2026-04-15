import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { a3CacheMissPostmortem } from '../../../src/detection/rules/a3-cache-miss-postmortem.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a3-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A3 cache-miss postmortem', () => {
  it('fires when session cache ratio << baseline', async () => {
    const db = getDb(tmp)
    const s = new SessionsRepo(db)
    const m = new MessagesRepo(db)
    for (let i = 0; i < 5; i++) {
      s.upsert({ id: `old${i}`, tool: 'claude_code', model: 'm', startedAt: i })
      m.insert({ sessionId: `old${i}`, turnIndex: 0, role: 'assistant', contentHash: 'h', inputTokens: 1000, cacheRead: 800, createdAt: i })
    }
    s.upsert({ id: 'CUR', tool: 'claude_code', model: 'm', startedAt: 1000 })
    m.insert({ sessionId: 'CUR', turnIndex: 0, role: 'assistant', contentHash: 'h', inputTokens: 1000, cacheRead: 50, createdAt: 1000 })

    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'CUR', timestamp: 1001,
      thresholds: { min_drop_pct: 50 }, hardBlockEnabled: false, now: () => 1001,
    }
    const det = await a3CacheMissPostmortem.evaluate(ctx)
    expect(det?.severity).toBe('info')
  })
})
