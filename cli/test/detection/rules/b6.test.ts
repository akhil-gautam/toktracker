import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b6RepeatQuestion } from '../../../src/detection/rules/b6-repeat-question.js'
import { sha256 } from '../../../src/capture/hashing.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b6-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B6 repeat question', () => {
  it('fires on 3+ identical content_hashes in last 90 days', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'past', tool: 'claude_code', model: 'm', startedAt: 1 })
    const m = new MessagesRepo(db)
    const hash = sha256('how does auth work')
    for (let i = 0; i < 3; i++) {
      m.insert({ sessionId: 'past', turnIndex: i, role: 'user', contentHash: hash, contentRedacted: 'how does auth work', createdAt: 1 + i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'cur', userPrompt: 'how does auth work',
      timestamp: 100, thresholds: { min_matches: 3, window_days: 90 },
      hardBlockEnabled: false, now: () => 100,
    }
    const det = await b6RepeatQuestion.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('claude_md_edit')
  })
})
