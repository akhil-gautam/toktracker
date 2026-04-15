import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo } from '../../../src/db/repository.js'
import { c12RunawayKillswitch } from '../../../src/detection/rules/c12-runaway-killswitch.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-c12-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('C12 runaway kill-switch', () => {
  it('returns block when session cost exceeds ceiling', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1, costMillicents: 150_000 })
    const ctx: DetectionContext = {
      db, trigger: 'PreToolUse', sessionId: 'S', timestamp: 1,
      thresholds: { ceiling_cents: 1000 }, hardBlockEnabled: true, now: () => 1,
    }
    const det = await c12RunawayKillswitch.evaluate(ctx)
    expect(det?.severity).toBe('block')
  })
})
