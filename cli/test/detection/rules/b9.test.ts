import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b9PromptPattern } from '../../../src/detection/rules/b9-prompt-pattern.js'
import { sha256 } from '../../../src/capture/hashing.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b9-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B9 prompt pattern extractor', () => {
  it('fires when a normalized prefix occurs in >= threshold prompts', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 6; i++) {
      const text = `review my PR #${i} and check for regressions against main`
      m.insert({ sessionId: 'S', turnIndex: i, role: 'user', contentHash: sha256(text), contentRedacted: text, createdAt: i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'Nightly', sessionId: 'S', timestamp: 10,
      thresholds: { min_occurrences: 5, min_prefix_tokens: 5 },
      hardBlockEnabled: false, now: () => 10,
    }
    const det = await b9PromptPattern.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('save_command')
  })
})
