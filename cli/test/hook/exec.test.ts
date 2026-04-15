import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { runHookExec } from '../../src/hook/exec.js'
import { HookEventsRepo } from '../../src/db/repository.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import type { Rule } from '../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-hookexec-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('runHookExec', () => {
  it('returns empty object on unknown hook kind without error', async () => {
    const res = await runHookExec({ kind: 'UnknownKind', payload: {}, db: getDb(tmp), registry: new RuleRegistry(), logPath: '/tmp/l' })
    expect(res).toEqual({})
  })
  it('persists hook_event row', async () => {
    const db = getDb(tmp)
    const payload = { session_id: 's1', hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/x' } }
    await runHookExec({ kind: 'PreToolUse', payload, db, registry: new RuleRegistry(), logPath: '/tmp/l' })
    expect(new HookEventsRepo(db).latencyPercentiles().count).toBe(1)
  })
  it('returns block decision when a rule blocks', async () => {
    const blockRule: Rule = {
      id: 'R_x', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'warn',
      hardBlockEligible: true, defaultThresholds: {},
      evaluate: () => ({ ruleId: 'R_x', severity: 'block', summary: 'nope' }),
    }
    const reg = new RuleRegistry(); reg.register(blockRule)
    const res = await runHookExec({ kind: 'PreToolUse', payload: { hook_event_name: 'PreToolUse' }, db: getDb(tmp), registry: reg, logPath: '/tmp/l' })
    expect(res.decision).toBe('block')
  })
})
