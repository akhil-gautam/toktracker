import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'

const tmp = join(tmpdir(), `tokscale-conn-${Date.now()}.db`)

afterEach(() => {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) {
    try { rmSync(tmp + suffix) } catch {}
  }
})

describe('db connection', () => {
  it('opens DB in WAL mode with busy_timeout >= 5000', () => {
    const db = getDb(tmp)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(Number(db.pragma('busy_timeout', { simple: true }))).toBeGreaterThanOrEqual(5000)
  })
  it('returns same instance on repeated calls with same path', () => {
    const a = getDb(tmp)
    const b = getDb(tmp)
    expect(a).toBe(b)
  })
})
