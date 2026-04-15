import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { buildHookContext } from '../../src/detection/context-builder.js'

const tmp = join(tmpdir(), `tokscale-ctxbuild-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('buildHookContext', () => {
  it('maps PreToolUse payload into DetectionContext', () => {
    const db = getDb(tmp)
    const payload = {
      session_id: 'sess-1', hook_event_name: 'PreToolUse',
      tool_name: 'Read', tool_input: { file_path: '/x' },
    }
    const ctx = buildHookContext(db, payload)
    expect(ctx.trigger).toBe('PreToolUse')
    expect(ctx.sessionId).toBe('sess-1')
    expect(ctx.toolName).toBe('Read')
  })
  it('maps UserPromptSubmit', () => {
    const db = getDb(tmp)
    const ctx = buildHookContext(db, { session_id: 's', hook_event_name: 'UserPromptSubmit', prompt: 'hi' })
    expect(ctx.trigger).toBe('UserPromptSubmit')
    expect(ctx.userPrompt).toBe('hi')
  })
})
