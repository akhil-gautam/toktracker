# Plan Part 5 — Phase 5: Category A + C Rules

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: §6.1 (Category A), §6.3 (Category C), §6.5 (trigger routing).

Depends on: Parts 1–4. Implements the eight live rules that run inside hook exec: A1–A5 and C10–C12. Each rule is a file under `src/detection/rules/` with a matching test under `test/detection/rules/`.

For every rule below, follow this TDD loop (I will stop repeating the boilerplate after A1):

1. Write a failing test asserting: rule emits the expected Detection on a crafted context; emits null when threshold not met.
2. Run: `npx vitest run test/detection/rules/<id>.test.ts` — expect FAIL.
3. Implement the rule module.
4. Re-run — expect PASS.
5. Register the rule in `src/detection/rules/index.ts`.
6. Commit.

---

## Task 5.1: Rule A1 — redundant tool call

**Files:** create `cli/src/detection/rules/a1-redundant-tool-call.ts`, test `cli/test/detection/rules/a1.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/a1.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { a1RedundantToolCall } from '../../../src/detection/rules/a1-redundant-tool-call.js'
import type { DetectionContext } from '../../../src/detection/types.js'
import { sha256, normalizeArgs } from '../../../src/capture/hashing.js'

const tmp = join(tmpdir(), `tokscale-a1-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

function makeCtx(overrides: Partial<DetectionContext> = {}): DetectionContext {
  return {
    db: getDb(tmp), trigger: 'PreToolUse', sessionId: 'S', toolName: 'Read',
    toolInput: { file_path: '/x.ts' }, timestamp: 100,
    thresholds: { min_repeat_count: 2 }, hardBlockEnabled: false,
    now: () => 100,
    ...overrides,
  }
}

describe('A1 redundant tool call', () => {
  it('returns null when tool not called before', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    expect(await a1RedundantToolCall.evaluate(makeCtx())).toBeNull()
  })
  it('returns warn when same args_hash already succeeded this session', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 50 })
    const argsHash = sha256(normalizeArgs({ file_path: '/x.ts' }))
    new ToolCallsRepo(db).insert({ messageId: msg.id!, sessionId: 'S', toolName: 'Read', argsHash, succeeded: 1, createdAt: 60 })
    const det = await a1RedundantToolCall.evaluate(makeCtx())
    expect(det?.severity).toBe('warn')
    expect(det?.metadata?.argsHash).toBe(argsHash)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/a1.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/a1-redundant-tool-call.ts`:

```ts
import { ToolCallsRepo } from '../../db/repository.js'
import { sha256, normalizeArgs } from '../../capture/hashing.js'
import type { Rule } from '../types.js'

export const a1RedundantToolCall: Rule = {
  id: 'A1_redundant_tool_call',
  category: 'A',
  triggers: ['PreToolUse'],
  defaultSeverity: 'warn',
  hardBlockEligible: true,
  defaultThresholds: { min_repeat_count: 2 },
  evaluate(ctx) {
    if (!ctx.sessionId || !ctx.toolName || ctx.toolInput == null) return null
    const argsHash = sha256(normalizeArgs(ctx.toolInput))
    const prior = new ToolCallsRepo(ctx.db).findBySessionToolArgs(ctx.sessionId, ctx.toolName, argsHash)
    const succeeded = prior.filter(p => p.succeeded === 1)
    if (succeeded.length < ctx.thresholds.min_repeat_count - 1) return null
    const turn = prior[0]?.createdAt
    return {
      ruleId: 'A1_redundant_tool_call',
      severity: 'warn',
      summary: `${ctx.toolName} with identical args already succeeded ${succeeded.length}× this session` + (turn ? `; first at ${new Date(turn).toISOString()}` : ''),
      metadata: { argsHash, priorCount: succeeded.length },
      suggestedAction: { kind: 'acknowledge_only', payload: { argsHash } },
    }
  },
}
```

- [ ] **Step 4: Register in index**

Modify `cli/src/detection/rules/index.ts`:

```ts
import type { RuleRegistry } from '../registry.js'
import { a1RedundantToolCall } from './a1-redundant-tool-call.js'

export function registerAllRules(registry: RuleRegistry): void {
  registry.register(a1RedundantToolCall)
}
```

- [ ] **Step 5: Verify + commit**

```bash
cd cli && npx vitest run test/detection/rules/a1.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): A1 redundant tool call detection"
```
Expected: 2 passing.

---

## Task 5.2: Rule A5 — retry/failure waste

**Files:** `cli/src/detection/rules/a5-retry-failure-waste.ts`, `cli/test/detection/rules/a5.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/a5.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { a5RetryFailureWaste } from '../../../src/detection/rules/a5-retry-failure-waste.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a5-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A5 retry/failure waste', () => {
  it('null below threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'PostToolUse', sessionId: 'S', timestamp: 1,
      thresholds: { min_failed_calls: 3, tokens_floor: 100 }, hardBlockEnabled: false, now: () => 1,
    }
    expect(await a5RetryFailureWaste.evaluate(ctx)).toBeNull()
  })
  it('fires when failed calls exceed threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 1 })
    const tc = new ToolCallsRepo(db)
    for (let i = 0; i < 4; i++) tc.insert({ messageId: msg.id!, sessionId: 'S', toolName: 'Bash', argsHash: `h${i}`, succeeded: 0, tokensReturned: 300, createdAt: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'PostToolUse', sessionId: 'S', timestamp: 1,
      thresholds: { min_failed_calls: 3, tokens_floor: 100 }, hardBlockEnabled: false, now: () => 1,
    }
    const det = await a5RetryFailureWaste.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect((det?.metadata?.failedCalls as number)).toBe(4)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/a5.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/a5-retry-failure-waste.ts`:

```ts
import type { Rule } from '../types.js'
import { ToolCallsRepo } from '../../db/repository.js'

export const a5RetryFailureWaste: Rule = {
  id: 'A5_retry_failure_waste',
  category: 'A',
  triggers: ['PostToolUse', 'Stop'],
  defaultSeverity: 'warn',
  hardBlockEligible: false,
  defaultThresholds: { min_failed_calls: 3, tokens_floor: 500 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const repo = new ToolCallsRepo(ctx.db)
    const failed = repo.failedCountInSession(ctx.sessionId)
    if (failed < ctx.thresholds.min_failed_calls) return null
    const tokens = (ctx.db.prepare('SELECT COALESCE(SUM(tokens_returned), 0) as t FROM tool_calls WHERE session_id = ? AND succeeded = 0').get(ctx.sessionId) as { t: number }).t
    if (tokens < ctx.thresholds.tokens_floor) return null
    return {
      ruleId: 'A5_retry_failure_waste',
      severity: 'warn',
      summary: `spent ${tokens} tokens on ${failed} failed tool calls this session`,
      metadata: { failedCalls: failed, tokensBurned: tokens },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

Modify `cli/src/detection/rules/index.ts` to also register `a5RetryFailureWaste`:

```ts
import { a5RetryFailureWaste } from './a5-retry-failure-waste.js'
// inside registerAllRules:
registry.register(a5RetryFailureWaste)
```

Then:

```bash
cd cli && npx vitest run test/detection/rules/a5.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): A5 retry/failure waste detection"
```

---

## Task 5.3: Rule A2 — context bloat

**Files:** `cli/src/detection/rules/a2-context-bloat.ts`, `cli/test/detection/rules/a2.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/a2.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { a2ContextBloat } from '../../../src/detection/rules/a2-context-bloat.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a2-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A2 context bloat', () => {
  it('fires when last N assistant turns exceed token ceiling', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 5; i++) {
      m.insert({ sessionId: 'S', turnIndex: i, role: 'assistant', contentHash: `h${i}`, outputTokens: 10_000, createdAt: 1 + i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'S', timestamp: 10,
      thresholds: { window_turns: 5, ceiling_tokens: 40000 }, hardBlockEnabled: false, now: () => 10,
    }
    const det = await a2ContextBloat.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect((det?.metadata?.windowTokens as number)).toBeGreaterThanOrEqual(40000)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/a2.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/a2-context-bloat.ts`:

```ts
import type { Rule } from '../types.js'

export const a2ContextBloat: Rule = {
  id: 'A2_context_bloat',
  category: 'A',
  triggers: ['UserPromptSubmit'],
  defaultSeverity: 'warn',
  hardBlockEligible: false,
  defaultThresholds: { window_turns: 5, ceiling_tokens: 40000 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const rows = ctx.db.prepare(
      `SELECT COALESCE(SUM(output_tokens), 0) as total
       FROM (SELECT output_tokens FROM messages
             WHERE session_id = ? AND role = 'assistant'
             ORDER BY turn_index DESC LIMIT ?)`
    ).get(ctx.sessionId, ctx.thresholds.window_turns) as { total: number }
    if (rows.total < ctx.thresholds.ceiling_tokens) return null
    return {
      ruleId: 'A2_context_bloat',
      severity: 'warn',
      summary: `last ${ctx.thresholds.window_turns} turns added ${rows.total} tokens — consider /compact`,
      metadata: { windowTokens: rows.total, windowTurns: ctx.thresholds.window_turns },
      suggestedAction: { kind: 'compact', payload: {} },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

Add registration and:

```bash
cd cli && npx vitest run test/detection/rules/a2.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): A2 context bloat detection"
```

---

## Task 5.4: Rule A3 — cache-miss postmortem

**Files:** `cli/src/detection/rules/a3-cache-miss-postmortem.ts`, `cli/test/detection/rules/a3.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/a3.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { a3CacheMissPostmortem } from '../../../src/detection/rules/a3-cache-miss-postmortem.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a3-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A3 cache-miss postmortem', () => {
  it('fires when session cache ratio << baseline', async () => {
    const db = getDb(tmp)
    const s = new SessionsRepo(db)
    const m = new MessagesRepo(db)
    for (let i = 0; i < 5; i++) {
      s.upsert({ id: `old${i}`, tool: 'claude_code', model: 'm', startedAt: i })
      m.insert({ sessionId: `old${i}`, turnIndex: 0, role: 'assistant', contentHash: 'h', inputTokens: 1000, cacheRead: 800, createdAt: i })
    }
    s.upsert({ id: 'CUR', tool: 'claude_code', model: 'm', startedAt: 1000 })
    m.insert({ sessionId: 'CUR', turnIndex: 0, role: 'assistant', contentHash: 'h', inputTokens: 1000, cacheRead: 50, createdAt: 1000 })

    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'CUR', timestamp: 1001,
      thresholds: { min_drop_pct: 50 }, hardBlockEnabled: false, now: () => 1001,
    }
    const det = await a3CacheMissPostmortem.evaluate(ctx)
    expect(det?.severity).toBe('info')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/a3.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/a3-cache-miss-postmortem.ts`:

```ts
import type { Rule } from '../types.js'

interface Ratio { session: string; ratio: number }

function sessionRatio(db: any, sessionId: string): Ratio {
  const row = db.prepare(`
    SELECT COALESCE(SUM(cache_read), 0) as cache, COALESCE(SUM(input_tokens), 0) as input
    FROM messages WHERE session_id = ?
  `).get(sessionId) as { cache: number; input: number }
  const ratio = row.input > 0 ? row.cache / (row.cache + row.input) : 0
  return { session: sessionId, ratio }
}

export const a3CacheMissPostmortem: Rule = {
  id: 'A3_cache_miss_postmortem',
  category: 'A',
  triggers: ['PostToolUse', 'Stop'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_drop_pct: 40, baseline_sessions: 5 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const current = sessionRatio(ctx.db, ctx.sessionId)
    const baselineRows = ctx.db.prepare(`
      SELECT id FROM sessions WHERE id != ? ORDER BY started_at DESC LIMIT ?
    `).all(ctx.sessionId, ctx.thresholds.baseline_sessions) as { id: string }[]
    if (baselineRows.length === 0) return null
    const avg = baselineRows.reduce((sum, r) => sum + sessionRatio(ctx.db, r.id).ratio, 0) / baselineRows.length
    const dropPct = (avg - current.ratio) * 100
    if (dropPct < ctx.thresholds.min_drop_pct) return null
    return {
      ruleId: 'A3_cache_miss_postmortem',
      severity: 'info',
      summary: `cache hit ratio dropped from ${Math.round(avg * 100)}% baseline to ${Math.round(current.ratio * 100)}% this session`,
      metadata: { baselineRatio: avg, currentRatio: current.ratio, dropPct },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/a3.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): A3 cache-miss postmortem detection"
```

---

## Task 5.5: Rule A4 — model mismatch

**Files:** `cli/src/detection/rules/a4-model-mismatch.ts`, `cli/test/detection/rules/a4.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/a4.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../../src/db/repository.js'
import { a4ModelMismatch } from '../../../src/detection/rules/a4-model-mismatch.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-a4-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('A4 model mismatch', () => {
  it('flags Opus session dominated by trivial Read/Edit calls', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1 })
    const msg = new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'assistant', contentHash: 'h', createdAt: 1 })
    const tc = new ToolCallsRepo(db)
    for (let i = 0; i < 10; i++) tc.insert({ messageId: msg.id!, sessionId: 'S', toolName: i < 5 ? 'Read' : 'Edit', argsHash: `h${i}`, createdAt: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'S', timestamp: 1,
      thresholds: { trivial_ratio_pct: 80, min_tool_calls: 5 }, hardBlockEnabled: false, now: () => 1,
    }
    const det = await a4ModelMismatch.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect(det?.suggestedAction?.kind).toBe('switch_model')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/a4.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/a4-model-mismatch.ts`:

```ts
import type { Rule } from '../types.js'

const PREMIUM_MODELS = ['claude-opus-4-6', 'claude-opus-4-5', 'claude-opus-4', 'gpt-5', 'o3', 'o1']
const TRIVIAL_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Edit'])

export const a4ModelMismatch: Rule = {
  id: 'A4_model_mismatch',
  category: 'A',
  triggers: ['Stop', 'UserPromptSubmit'],
  defaultSeverity: 'warn',
  hardBlockEligible: true,
  defaultThresholds: { trivial_ratio_pct: 80, min_tool_calls: 10 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const session = ctx.db.prepare('SELECT model FROM sessions WHERE id = ?').get(ctx.sessionId) as { model: string } | undefined
    if (!session || !PREMIUM_MODELS.some(m => session.model.toLowerCase().includes(m))) return null
    const tools = ctx.db.prepare('SELECT tool_name, COUNT(*) as c FROM tool_calls WHERE session_id = ? GROUP BY tool_name').all(ctx.sessionId) as Array<{ tool_name: string; c: number }>
    const total = tools.reduce((s, t) => s + t.c, 0)
    if (total < ctx.thresholds.min_tool_calls) return null
    const trivial = tools.filter(t => TRIVIAL_TOOLS.has(t.tool_name)).reduce((s, t) => s + t.c, 0)
    const ratio = (trivial / total) * 100
    if (ratio < ctx.thresholds.trivial_ratio_pct) return null
    return {
      ruleId: 'A4_model_mismatch',
      severity: 'warn',
      summary: `${Math.round(ratio)}% of tool calls are trivial (${trivial}/${total}) on ${session.model} — Sonnet likely cheaper`,
      metadata: { trivialRatio: ratio, model: session.model, totalCalls: total },
      suggestedAction: { kind: 'switch_model', payload: { suggest: 'claude-sonnet-4-6' } },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/a4.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): A4 model mismatch detection"
```

---

## Task 5.6: Rule C10 — context-window ETA

**Files:** `cli/src/detection/rules/c10-context-window-eta.ts`, `cli/test/detection/rules/c10.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/c10.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { c10ContextWindowEta } from '../../../src/detection/rules/c10-context-window-eta.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-c10-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('C10 context-window ETA', () => {
  it('fires when extrapolated turns to ceiling <= threshold', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 4; i++) m.insert({ sessionId: 'S', turnIndex: i, role: 'assistant', contentHash: 'h', inputTokens: 40000, outputTokens: 2000, createdAt: i })
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'S', timestamp: 10,
      thresholds: { warn_turns: 10 }, hardBlockEnabled: false, now: () => 10,
    }
    const det = await c10ContextWindowEta.evaluate(ctx)
    expect(det?.severity).toBe('warn')
    expect(det?.metadata?.etaTurns).toBeDefined()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/c10.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/c10-context-window-eta.ts`:

```ts
import type { Rule } from '../types.js'

const CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus': 200_000,
  'claude-sonnet': 200_000,
  'claude-haiku': 200_000,
  'gpt': 128_000,
  'gemini': 1_000_000,
}

function limitFor(model: string): number {
  const lower = model.toLowerCase()
  for (const k of Object.keys(CONTEXT_LIMITS)) if (lower.includes(k)) return CONTEXT_LIMITS[k]
  return 200_000
}

export const c10ContextWindowEta: Rule = {
  id: 'C10_context_window_eta',
  category: 'C',
  triggers: ['UserPromptSubmit'],
  defaultSeverity: 'warn',
  hardBlockEligible: false,
  defaultThresholds: { warn_turns: 10 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const session = ctx.db.prepare('SELECT model FROM sessions WHERE id = ?').get(ctx.sessionId) as { model: string } | undefined
    if (!session) return null
    const row = ctx.db.prepare(`
      SELECT COALESCE(SUM(input_tokens + output_tokens), 0) as used, COUNT(*) as turns
      FROM messages WHERE session_id = ? AND role = 'assistant'
    `).get(ctx.sessionId) as { used: number; turns: number }
    if (row.turns < 2) return null
    const ceiling = limitFor(session.model)
    const avgPerTurn = row.used / row.turns
    const remaining = Math.max(ceiling - row.used, 0)
    const etaTurns = avgPerTurn > 0 ? Math.floor(remaining / avgPerTurn) : Infinity
    if (etaTurns > ctx.thresholds.warn_turns) return null
    return {
      ruleId: 'C10_context_window_eta',
      severity: 'warn',
      summary: `context projected to hit ${ceiling.toLocaleString()} in ~${etaTurns} turns (using ${row.used.toLocaleString()} / ${ceiling.toLocaleString()})`,
      metadata: { etaTurns, used: row.used, ceiling, avgPerTurn },
      suggestedAction: { kind: 'compact', payload: {} },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/c10.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): C10 context-window ETA"
```

---

## Task 5.7: Rule C11 — pre-flight cost estimate

**Files:** `cli/src/detection/rules/c11-preflight-cost.ts`, `cli/test/detection/rules/c11.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/c11.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { c11PreflightCost } from '../../../src/detection/rules/c11-preflight-cost.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-c11-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('C11 preflight cost', () => {
  it('returns info detection with cost range when prompt present', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-sonnet-4-6', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 3; i++) m.insert({ sessionId: 'S', turnIndex: i, role: 'assistant', contentHash: 'h', inputTokens: 30000, outputTokens: 1500, createdAt: i })
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'S', userPrompt: 'hello world',
      timestamp: 10, thresholds: { min_cost_cents: 1 }, hardBlockEnabled: false, now: () => 10,
    }
    const det = await c11PreflightCost.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.metadata?.estLowCents).toBeDefined()
    expect(det?.metadata?.estHighCents).toBeDefined()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/c11.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/c11-preflight-cost.ts`:

```ts
import type { Rule } from '../types.js'

const RATES: Record<string, { in: number; out: number }> = {
  'claude-opus': { in: 15, out: 75 },
  'claude-sonnet': { in: 3, out: 15 },
  'claude-haiku': { in: 0.8, out: 4 },
  'gpt-5': { in: 5, out: 20 },
  'gemini': { in: 1, out: 3 },
}

function rateFor(model: string): { in: number; out: number } {
  const lower = model.toLowerCase()
  for (const k of Object.keys(RATES)) if (lower.includes(k)) return RATES[k]
  return RATES['claude-sonnet']
}

export const c11PreflightCost: Rule = {
  id: 'C11_preflight_cost',
  category: 'C',
  triggers: ['UserPromptSubmit'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_cost_cents: 1 },
  evaluate(ctx) {
    if (!ctx.sessionId || !ctx.userPrompt) return null
    const session = ctx.db.prepare('SELECT model FROM sessions WHERE id = ?').get(ctx.sessionId) as { model: string } | undefined
    if (!session) return null
    const avgRow = ctx.db.prepare(`
      SELECT COALESCE(AVG(input_tokens), 0) as ai, COALESCE(AVG(output_tokens), 0) as ao
      FROM messages WHERE session_id = ? AND role = 'assistant'
    `).get(ctx.sessionId) as { ai: number; ao: number }
    const promptTokens = Math.ceil((ctx.userPrompt.length || 0) / 4)
    const estInputLow  = promptTokens + avgRow.ai * 0.7
    const estInputHigh = promptTokens + avgRow.ai * 1.3
    const estOutputLow  = avgRow.ao * 0.5
    const estOutputHigh = avgRow.ao * 1.5
    const rate = rateFor(session.model)
    const lowDollars  = (estInputLow  * rate.in + estOutputLow  * rate.out) / 1_000_000
    const highDollars = (estInputHigh * rate.in + estOutputHigh * rate.out) / 1_000_000
    const lowCents = Math.round(lowDollars * 100)
    const highCents = Math.round(highDollars * 100)
    if (highCents < ctx.thresholds.min_cost_cents) return null
    return {
      ruleId: 'C11_preflight_cost',
      severity: 'info',
      summary: `estimated turn cost: $${(lowCents / 100).toFixed(2)}–$${(highCents / 100).toFixed(2)}`,
      metadata: { estLowCents: lowCents, estHighCents: highCents, model: session.model },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/c11.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): C11 preflight cost estimate"
```

---

## Task 5.8: Rule C12 — runaway kill-switch

**Files:** `cli/src/detection/rules/c12-runaway-killswitch.ts`, `cli/test/detection/rules/c12.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/c12.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/c12.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/c12-runaway-killswitch.ts`:

```ts
import type { Rule } from '../types.js'

export const c12RunawayKillswitch: Rule = {
  id: 'C12_runaway_killswitch',
  category: 'C',
  triggers: ['PreToolUse'],
  defaultSeverity: 'block',
  hardBlockEligible: true,
  defaultThresholds: { ceiling_cents: 2000 },
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const row = ctx.db.prepare('SELECT cost_millicents FROM sessions WHERE id = ?').get(ctx.sessionId) as { cost_millicents: number } | undefined
    if (!row) return null
    const cents = Math.round(row.cost_millicents / 10)
    if (cents < ctx.thresholds.ceiling_cents) return null
    return {
      ruleId: 'C12_runaway_killswitch',
      severity: 'block',
      summary: `session cost $${(cents / 100).toFixed(2)} exceeds ceiling $${(ctx.thresholds.ceiling_cents / 100).toFixed(2)}`,
      metadata: { cents, ceiling: ctx.thresholds.ceiling_cents },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/c12.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): C12 runaway kill-switch"
```

---

## Task 5.9: Update registerAllRules

**Files:** modify `cli/src/detection/rules/index.ts`

- [ ] **Step 1: Replace with full registration list**

Write to `cli/src/detection/rules/index.ts`:

```ts
import type { RuleRegistry } from '../registry.js'
import { a1RedundantToolCall } from './a1-redundant-tool-call.js'
import { a2ContextBloat } from './a2-context-bloat.js'
import { a3CacheMissPostmortem } from './a3-cache-miss-postmortem.js'
import { a4ModelMismatch } from './a4-model-mismatch.js'
import { a5RetryFailureWaste } from './a5-retry-failure-waste.js'
import { c10ContextWindowEta } from './c10-context-window-eta.js'
import { c11PreflightCost } from './c11-preflight-cost.js'
import { c12RunawayKillswitch } from './c12-runaway-killswitch.js'

export function registerAllRules(registry: RuleRegistry): void {
  registry.register(a1RedundantToolCall)
  registry.register(a2ContextBloat)
  registry.register(a3CacheMissPostmortem)
  registry.register(a4ModelMismatch)
  registry.register(a5RetryFailureWaste)
  registry.register(c10ContextWindowEta)
  registry.register(c11PreflightCost)
  registry.register(c12RunawayKillswitch)
}
```

- [ ] **Step 2: Commit**

```bash
cd cli && npm run test:run && npm run lint
git add src/detection/rules/index.ts
git commit -m "feat(rules): register all Category A + C rules"
```

---

## Phase 5 verification gate

- [ ] Full test suite passes: `cd cli && npm run test:run`
- [ ] Lint passes: `cd cli && npm run lint`
- [ ] All 8 A/C rules register without error.
- [ ] Proceed to Part 6 (Category B + D rules).
- [ ] Update `cli/HANDOVER.md` listing the 8 rule files. Commit.
