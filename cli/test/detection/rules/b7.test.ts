import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b7CorrectionGraph } from '../../../src/detection/rules/b7-correction-graph.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b7-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B7 correction graph', () => {
  it('emits an info detection when the current user turn starts with a correction phrase', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'user', contentHash: 'h', contentRedacted: "no don't use mocks, hit the real DB", createdAt: 10 })
    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'S', timestamp: 11,
      thresholds: {}, hardBlockEnabled: false, now: () => 11,
    }
    const det = await b7CorrectionGraph.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('claude_md_edit')
  })
})
