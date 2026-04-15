import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'

const tmp = join(tmpdir(), `tokscale-migrate-${Date.now()}.db`)

afterEach(() => {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) { try { rmSync(tmp + suffix) } catch {} }
})

describe('migrate', () => {
  it('creates all tables on fresh DB', () => {
    const db = getDb(tmp)
    migrate(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    for (const t of ['batch_runs','detections','feature_flags','git_events','hook_events','messages','pr_attributions','redaction_rules','schema_version','sessions','tool_calls']) {
      expect(names).toContain(t)
    }
  })
  it('is idempotent', () => {
    const db = getDb(tmp)
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const v = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number }
    expect(v.v).toBe(1)
  })
})
