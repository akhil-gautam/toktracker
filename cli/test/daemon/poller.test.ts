import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { Poller } from '../../src/daemon/poller.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import type { Rule } from '../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-poller-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('Poller', () => {
  it('invokes detection runner and calls notify on warn', async () => {
    const db = getDb(tmp)
    const rule: Rule = {
      id: 'R', category: 'A', triggers: ['PollTick'], defaultSeverity: 'warn',
      hardBlockEligible: false, defaultThresholds: {},
      evaluate: () => ({ ruleId: 'R', severity: 'warn', summary: 'poll warn' }),
    }
    const reg = new RuleRegistry(); reg.register(rule)
    const notify = vi.fn()
    const p = new Poller(db, reg, { notify })
    await p.tick()
    expect(notify).toHaveBeenCalled()
  })
})
