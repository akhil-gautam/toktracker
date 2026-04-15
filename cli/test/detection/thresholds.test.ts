import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { FeatureFlagsRepo } from '../../src/db/repository.js'
import { ThresholdLoader } from '../../src/detection/thresholds.js'

const tmp = join(tmpdir(), `tokscale-thresholds-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('ThresholdLoader', () => {
  it('returns defaults when flag missing', () => {
    const loader = new ThresholdLoader(getDb(tmp))
    const t = loader.load('A1_redundant_tool_call', { min_repeat_count: 2 })
    expect(t.thresholds.min_repeat_count).toBe(2)
    expect(t.enabled).toBe(true)
    expect(t.hardBlock).toBe(false)
  })
  it('overrides from feature_flags.config_json', () => {
    const db = getDb(tmp)
    new FeatureFlagsRepo(db).set('A1_redundant_tool_call', {
      enabled: true, hard_block: true, thresholds: { min_repeat_count: 5 },
    })
    const loader = new ThresholdLoader(db)
    const t = loader.load('A1_redundant_tool_call', { min_repeat_count: 2 })
    expect(t.thresholds.min_repeat_count).toBe(5)
    expect(t.hardBlock).toBe(true)
  })
  it('respects enabled=false', () => {
    const db = getDb(tmp)
    new FeatureFlagsRepo(db).set('A1_redundant_tool_call', { enabled: false })
    const loader = new ThresholdLoader(db)
    expect(loader.load('A1_redundant_tool_call', {}).enabled).toBe(false)
  })
})
