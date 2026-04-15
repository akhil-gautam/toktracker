import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { GitEventsRepo } from '../../src/db/repository.js'
import { GitEventWorker } from '../../src/git/event-worker.js'

const tmp = join(tmpdir(), `tokscale-git-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('GitEventWorker', () => {
  it('dedupes merged PRs on repeated poll', async () => {
    const db = getDb(tmp)
    const runner = vi.fn().mockResolvedValue([
      { number: 12, mergedAt: '2026-04-01T00:00:00Z', headRefName: 'feat/x', mergeCommit: { oid: 'abc123' } },
    ])
    const w = new GitEventWorker(db, { ghRun: runner })
    await w.pollRepo('a/b')
    await w.pollRepo('a/b')
    expect(new GitEventsRepo(db).findByRepo('a/b').length).toBe(1)
  })
})
