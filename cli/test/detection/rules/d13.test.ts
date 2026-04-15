import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, GitEventsRepo, PrAttributionsRepo } from '../../../src/db/repository.js'
import { d13CostPerPr } from '../../../src/detection/rules/d13-cost-per-pr.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-d13-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('D13 cost per PR', () => {
  it('summarises PR cost from attributions', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's', tool: 'claude_code', model: 'm', startedAt: 1, gitRepo: 'a/b', costMillicents: 5000 })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 42, branch: 'b', sha: null, createdAt: 10 })
    new PrAttributionsRepo(db).upsert({ repo: 'a/b', prNumber: 42, sessionId: 's', overlapKind: 'branch_match', confidence: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'GitEvent', timestamp: 10,
      thresholds: {}, hardBlockEnabled: false, now: () => 10,
    }
    const det = await d13CostPerPr.evaluate({ ...ctx, sessionId: undefined })
    expect(det?.severity).toBe('info')
    expect((det?.metadata?.prNumber as number)).toBe(42)
  })
})
