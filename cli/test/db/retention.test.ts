import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../src/db/repository.js'
import { purge } from '../../src/db/retention.js'

const tmp = join(tmpdir(), `tokscale-retention-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('purge', () => {
  it('deletes messages older than retention_days, keeps sessions', () => {
    const db = getDb(tmp)
    const s = new SessionsRepo(db)
    const m = new MessagesRepo(db)
    const old = Date.now() - 100 * 24 * 60 * 60 * 1000
    const recent = Date.now()
    s.upsert({ id: 'sold', tool: 'claude_code', model: 'x', startedAt: old })
    s.upsert({ id: 'srec', tool: 'claude_code', model: 'x', startedAt: recent })
    m.insert({ sessionId: 'sold', turnIndex: 0, role: 'user', contentHash: 'h', createdAt: old })
    m.insert({ sessionId: 'srec', turnIndex: 0, role: 'user', contentHash: 'h', createdAt: recent })
    const result = purge(db, 90)
    expect(result.messages).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c).toBe(2)
  })
})
