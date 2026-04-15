import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../src/db/repository.js'
import { HookEventsRepo, GitEventsRepo, DetectionsRepo, FeatureFlagsRepo, PrAttributionsRepo, BatchRunsRepo } from '../../src/db/repository.js'

const tmp = join(tmpdir(), `tokscale-repo-${Date.now()}.db`)

beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('SessionsRepo', () => {
  it('upserts and finds by id', () => {
    const repo = new SessionsRepo(getDb(tmp))
    repo.upsert({ id: 's1', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1000 })
    expect(repo.findById('s1')?.model).toBe('claude-opus-4-6')
  })
})

describe('MessagesRepo + ToolCallsRepo', () => {
  it('inserts rows tied to a session', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's2', tool: 'claude_code', model: 'sonnet', startedAt: 2000 })
    const msg = new MessagesRepo(db).insert({ sessionId: 's2', turnIndex: 0, role: 'user', contentHash: 'h1', inputTokens: 100, createdAt: 2001 })
    expect(msg.id).toBeGreaterThan(0)
    const tc = new ToolCallsRepo(db).insert({ messageId: msg.id!, sessionId: 's2', toolName: 'Read', argsHash: 'a1', targetPath: '/x', createdAt: 2002 })
    expect(tc.id).toBeGreaterThan(0)
    expect(new ToolCallsRepo(db).findBySessionToolArgs('s2', 'Read', 'a1').length).toBe(1)
  })
})

describe('remaining repos', () => {
  it('persists each row type', () => {
    const db = getDb(tmp)
    const he = new HookEventsRepo(db).insert({ sessionId: null, hookKind: 'PreToolUse', payloadJson: '{}', createdAt: 1 })
    expect(he.id).toBeGreaterThan(0)
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 12, createdAt: 2 })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 12, createdAt: 3 })
    expect(new GitEventsRepo(db).findByRepo('a/b').length).toBe(1)
    new SessionsRepo(db).upsert({ id: 's9', tool: 'claude_code', model: 'm', startedAt: 1 })
    new DetectionsRepo(db).insert({ sessionId: 's9', ruleId: 'A1_redundant_tool_call', severity: 'warn', summary: 'x', createdAt: 4 })
    expect(new DetectionsRepo(db).recent(10).length).toBe(1)
    new FeatureFlagsRepo(db).set('A1_redundant_tool_call', { enabled: true, hard_block: false })
    expect(new FeatureFlagsRepo(db).get('A1_redundant_tool_call')?.enabled).toBe(1)
    new PrAttributionsRepo(db).upsert({ prNumber: 12, repo: 'a/b', sessionId: 's9', overlapKind: 'branch_match', confidence: 0.9 })
    expect(new PrAttributionsRepo(db).findByPr('a/b', 12).length).toBe(1)
    new BatchRunsRepo(db).mark('b6_clustering', 'ok', 100)
    expect(new BatchRunsRepo(db).lastRunAt('b6_clustering')).toBe(100)
  })
})
