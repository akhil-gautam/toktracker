import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo } from '../../src/db/repository.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { registerAllRules } from '../../src/detection/rules/index.js'
import { runNightlyJobs } from '../../src/scheduler/jobs.js'
import { BatchRunsRepo } from '../../src/db/repository.js'

const tmp = join(tmpdir(), `tokscale-nightly-${Date.now()}.db`)
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('E2E nightly', () => {
  it('runs all nightly jobs without throwing and records batch_runs', async () => {
    const db = getDb(tmp); migrate(db)
    new SessionsRepo(db).upsert({ id: 'old', tool: 'claude_code', model: 'm', startedAt: Date.now() - 100 * 24 * 60 * 60 * 1000 })
    const reg = new RuleRegistry(); registerAllRules(reg)
    await runNightlyJobs(db, reg, 90)
    expect(new BatchRunsRepo(db).lastRunAt('vacuum')).toBeTruthy()
  })
})
