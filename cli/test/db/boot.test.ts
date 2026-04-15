import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootDb } from '../../src/db/boot.js'
import { closeDb } from '../../src/db/connection.js'

const dir = join(tmpdir(), `tokscale-boot-${Date.now()}`)
const p = join(dir, 'toktracker.db')

afterEach(() => { closeDb(); try { rmSync(dir, { recursive: true }) } catch {} })

describe('bootDb', () => {
  it('migrates + seeds builtin redaction rules', () => {
    const db = bootDb(p)
    const rows = db.prepare('SELECT COUNT(*) as c FROM redaction_rules WHERE builtin = 1').get() as { c: number }
    expect(rows.c).toBeGreaterThan(0)
  })
})
