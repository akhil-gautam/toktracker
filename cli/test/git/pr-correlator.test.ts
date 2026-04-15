import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, GitEventsRepo, PrAttributionsRepo } from '../../src/db/repository.js'
import { correlatePrToSessions } from '../../src/git/pr-correlator.js'

const tmp = join(tmpdir(), `tokscale-prcorr-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('correlatePrToSessions', () => {
  it('attributes sessions on matching branch to the PR', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's1', tool: 'claude_code', model: 'm', startedAt: 1, gitRepo: 'a/b', gitBranch: 'feat/x' })
    new SessionsRepo(db).upsert({ id: 's2', tool: 'claude_code', model: 'm', startedAt: 2, gitRepo: 'a/b', gitBranch: 'main' })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 7, branch: 'feat/x', sha: 'abc', createdAt: 10 })
    correlatePrToSessions(db, 'a/b', 7)
    const attrs = new PrAttributionsRepo(db).findByPr('a/b', 7)
    expect(attrs.some(a => a.sessionId === 's1')).toBe(true)
    expect(attrs.some(a => a.sessionId === 's2')).toBe(false)
  })

  it('attributes via commit ancestry when branch differs', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's3', tool: 'claude_code', model: 'm', startedAt: 1, gitRepo: 'a/b', gitBranch: 'other', gitCommitStart: 'abc', gitCommitEnd: 'abc' })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 9, branch: 'feat/y', sha: 'abc', createdAt: 10 })
    correlatePrToSessions(db, 'a/b', 9)
    const attrs = new PrAttributionsRepo(db).findByPr('a/b', 9)
    expect(attrs.some(a => a.sessionId === 's3' && a.overlapKind === 'commit_ancestor')).toBe(true)
  })
})
