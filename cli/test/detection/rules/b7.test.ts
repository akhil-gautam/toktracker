import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b7CorrectionGraph, extractCorrection } from '../../../src/detection/rules/b7-correction-graph.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b7-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B7 correction graph', () => {
  it('extracts first-clause phrase from a correction message', () => {
    expect(extractCorrection("Don't mock the db, it hides migration bugs"))
      .toBe("don't mock the db")
    expect(extractCorrection('random prose with no cue')).toBeNull()
  })

  it('fires when the same correction repeats across multiple sessions', async () => {
    const db = getDb(tmp)
    const sessions = new SessionsRepo(db)
    const messages = new MessagesRepo(db)
    // Seed 3 sessions, each with a "don't mock the db" correction.
    for (let i = 0; i < 3; i++) {
      const id = `S${i}`
      sessions.upsert({ id, tool: 'claude_code', model: 'm', startedAt: 1 })
      messages.insert({
        sessionId: id, turnIndex: 0, role: 'user', contentHash: `h${i}`,
        contentRedacted: "Don't mock the db, it hides migration bugs",
        createdAt: 1_700_000_000_000 + i,
      })
    }
    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'S2', timestamp: 1_700_000_000_100,
      thresholds: { min_count: 3, min_sessions: 2, window_days: 30 },
      hardBlockEnabled: false,
      now: () => 1_700_000_000_100,
    }
    const det = await b7CorrectionGraph.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('claude_md_edit')
    expect((det?.suggestedAction?.payload as { phrase: string }).phrase)
      .toBe("don't mock the db")
  })

  it('does not fire when count is below threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    new MessagesRepo(db).insert({
      sessionId: 'S', turnIndex: 0, role: 'user', contentHash: 'h',
      contentRedacted: "Don't mock the db",
      createdAt: 1_700_000_000_000,
    })
    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'S', timestamp: 1_700_000_000_100,
      thresholds: { min_count: 3, min_sessions: 2, window_days: 30 },
      hardBlockEnabled: false,
      now: () => 1_700_000_000_100,
    }
    const det = await b7CorrectionGraph.evaluate(ctx)
    expect(det).toBeNull()
  })
})
