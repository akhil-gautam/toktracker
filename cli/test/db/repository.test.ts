import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../src/db/repository.js'

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
