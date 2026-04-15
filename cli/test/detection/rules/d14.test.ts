import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo } from '../../../src/db/repository.js'
import { d14AbandonedSession } from '../../../src/detection/rules/d14-abandoned-session.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-d14-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('D14 abandoned session', () => {
  it('flags sessions old enough without commits or PRs', async () => {
    const db = getDb(tmp)
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000
    new SessionsRepo(db).upsert({ id: 'old', tool: 'claude_code', model: 'm', startedAt: old, gitRepo: 'a/b', gitBranch: 'feat/orphan', costMillicents: 50_000 })
    const ctx: DetectionContext = {
      db, trigger: 'Nightly', timestamp: Date.now(),
      thresholds: { min_age_days: 7, min_cents: 1 }, hardBlockEnabled: false, now: () => Date.now(),
    }
    const det = await d14AbandonedSession.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.metadata?.sessionIds).toBeDefined()
  })
})
