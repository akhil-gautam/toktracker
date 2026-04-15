import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { b8FileReopen } from '../../../src/detection/rules/b8-file-reopen.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b8-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B8 file-reopen tracker', () => {
  it('fires when same file is read in >= threshold distinct sessions', async () => {
    const db = getDb(tmp)
    const s = new SessionsRepo(db)
    const m = new MessagesRepo(db)
    const t = new ToolCallsRepo(db)
    for (let i = 0; i < 5; i++) {
      s.upsert({ id: `S${i}`, tool: 'claude_code', model: 'm', startedAt: i })
      const msg = m.insert({ sessionId: `S${i}`, turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: i })
      t.insert({ messageId: msg.id!, sessionId: `S${i}`, toolName: 'Read', argsHash: `h${i}`, targetPath: '/shared/auth.ts', createdAt: i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'PostToolUse', sessionId: 'S0', toolName: 'Read', toolInput: { file_path: '/shared/auth.ts' },
      timestamp: 100, thresholds: { min_sessions: 5, window_days: 14 },
      hardBlockEnabled: false, now: () => 100,
    }
    const det = await b8FileReopen.evaluate(ctx)
    expect(det?.severity).toBe('info')
  })
})
