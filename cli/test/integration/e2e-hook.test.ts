import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../src/db/repository.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { registerAllRules } from '../../src/detection/rules/index.js'
import { runHookExec } from '../../src/hook/exec.js'
import { sha256, normalizeArgs } from '../../src/capture/hashing.js'

const tmp = join(tmpdir(), `tokscale-e2e-${Date.now()}.db`)
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('E2E hook', () => {
  it('fires A1 when same Read args seen twice in one session', async () => {
    const db = getDb(tmp); migrate(db)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 1 })
    const args = { file_path: '/x.ts' }
    new ToolCallsRepo(db).insert({ messageId: msg.id!, sessionId: 'S', toolName: 'Read', argsHash: sha256(normalizeArgs(args)), succeeded: 1, createdAt: 1 })

    const reg = new RuleRegistry(); registerAllRules(reg)
    const res = await runHookExec({
      kind: 'PreToolUse', db, registry: reg, logPath: '/tmp/e2e.log',
      payload: { session_id: 'S', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: args },
    })
    // Result may be additionalContext (warn) or reason (block) depending on hardBlock config.
    // The runner includes the summary (not rule ID) in the text; we verify the detection fired.
    const text = res.additionalContext ?? res.reason ?? ''
    expect(text.length).toBeGreaterThan(0)
    expect(text).toContain('identical args')
  })
})
