import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { BatchRunsRepo } from '../../src/db/repository.js'
import { runNightlyJobs } from '../../src/scheduler/jobs.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { registerAllRules } from '../../src/detection/rules/index.js'

const tmp = join(tmpdir(), `tokscale-jobs-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('runNightlyJobs', () => {
  it('marks all nightly jobs in batch_runs', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); registerAllRules(reg)
    await runNightlyJobs(db, reg)
    const repo = new BatchRunsRepo(db)
    expect(repo.lastRunAt('b6_clustering')).toBeTruthy()
    expect(repo.lastRunAt('b9_pattern_mining')).toBeTruthy()
    expect(repo.lastRunAt('d14_abandoned')).toBeTruthy()
    expect(repo.lastRunAt('vacuum')).toBeTruthy()
  })
})
