# Plan Part 3 — Phase 3: Detection Engine Core

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: §6, §7.2 of the design.

Depends on: Parts 1–2. Builds the rule registry, detection runner, context builder, threshold loader — everything needed before individual rules can be implemented.

---

## Task 3.1: Detection types module

**Files:** create `cli/src/detection/types.ts`

- [ ] **Step 1: Write types module**

Write to `cli/src/detection/types.ts`:

```ts
import type Database from 'better-sqlite3'

export type Trigger =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'PollTick'
  | 'GitEvent'
  | 'Nightly'

export type Category = 'A' | 'B' | 'C' | 'D'

export type Severity = 'info' | 'warn' | 'block'

export interface Detection {
  ruleId: string
  severity: Severity
  summary: string
  metadata?: Record<string, unknown>
  suggestedAction?: {
    kind: 'claude_md_edit' | 'save_command' | 'compact' | 'switch_model' | 'acknowledge_only'
    payload: Record<string, unknown>
  }
}

export interface DetectionContext {
  db: Database.Database
  trigger: Trigger
  sessionId?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  userPrompt?: string
  timestamp: number
  thresholds: Record<string, number>
  hardBlockEnabled: boolean
  now(): number
}

export interface Rule {
  id: string
  category: Category
  triggers: Trigger[]
  defaultSeverity: Severity
  hardBlockEligible: boolean
  defaultThresholds: Record<string, number>
  evaluate(ctx: DetectionContext): Promise<Detection | null> | Detection | null
}

export interface HookDecision {
  decision?: 'block'
  reason?: string
  additionalContext?: string
}
```

- [ ] **Step 2: Lint + commit**

```bash
cd cli && npm run lint
git add src/detection/types.ts
git commit -m "feat(detection): core types (Rule, Detection, DetectionContext, Trigger)"
```

---

## Task 3.2: Rule registry

**Files:** create `cli/src/detection/registry.ts`, test `cli/test/detection/registry.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { RuleRegistry } from '../../src/detection/registry.js'
import type { Rule } from '../../src/detection/types.js'

const sampleA: Rule = {
  id: 'A1_redundant_tool_call', category: 'A',
  triggers: ['PreToolUse'], defaultSeverity: 'warn', hardBlockEligible: true,
  defaultThresholds: { min_repeat_count: 2 },
  evaluate: () => null,
}
const sampleB: Rule = {
  id: 'B6_repeat_question', category: 'B',
  triggers: ['UserPromptSubmit', 'Nightly'], defaultSeverity: 'info', hardBlockEligible: false,
  defaultThresholds: { min_matches: 3 },
  evaluate: () => null,
}

describe('RuleRegistry', () => {
  let reg: RuleRegistry
  beforeEach(() => { reg = new RuleRegistry(); reg.register(sampleA); reg.register(sampleB) })

  it('lists rules by category', () => {
    expect(reg.byCategory('A')).toHaveLength(1)
    expect(reg.byCategory('B')).toHaveLength(1)
  })
  it('resolves rules by trigger', () => {
    expect(reg.byTrigger('PreToolUse').map(r => r.id)).toEqual(['A1_redundant_tool_call'])
    expect(reg.byTrigger('UserPromptSubmit').map(r => r.id)).toEqual(['B6_repeat_question'])
  })
  it('returns all', () => {
    expect(reg.all()).toHaveLength(2)
  })
  it('throws on duplicate registration', () => {
    expect(() => reg.register(sampleA)).toThrow()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/registry.ts`:

```ts
import type { Category, Rule, Trigger } from './types.js'

export class RuleRegistry {
  private rules = new Map<string, Rule>()

  register(rule: Rule): void {
    if (this.rules.has(rule.id)) throw new Error(`Duplicate rule id: ${rule.id}`)
    this.rules.set(rule.id, rule)
  }
  all(): Rule[] {
    return [...this.rules.values()]
  }
  byTrigger(trigger: Trigger): Rule[] {
    return this.all().filter(r => r.triggers.includes(trigger))
  }
  byCategory(category: Category): Rule[] {
    return this.all().filter(r => r.category === category)
  }
  get(id: string): Rule | undefined {
    return this.rules.get(id)
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/detection/registry.test.ts
git add src/detection/registry.ts test/detection/registry.test.ts
git commit -m "feat(detection): RuleRegistry"
```

---

## Task 3.3: Threshold loader (feature_flags-backed)

**Files:** create `cli/src/detection/thresholds.ts`, test `cli/test/detection/thresholds.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/thresholds.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/thresholds.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/thresholds.ts`:

```ts
import type Database from 'better-sqlite3'
import { FeatureFlagsRepo } from '../db/repository.js'

export interface ResolvedThresholds {
  enabled: boolean
  hardBlock: boolean
  thresholds: Record<string, number>
}

export class ThresholdLoader {
  private flags: FeatureFlagsRepo
  constructor(db: Database.Database) {
    this.flags = new FeatureFlagsRepo(db)
  }
  load(ruleId: string, defaults: Record<string, number>): ResolvedThresholds {
    const row = this.flags.get(ruleId)
    if (!row) return { enabled: true, hardBlock: false, thresholds: { ...defaults } }
    const config = row.config ?? {}
    const custom = (config.thresholds as Record<string, number> | undefined) ?? {}
    return {
      enabled: row.enabled === 1,
      hardBlock: !!config.hard_block,
      thresholds: { ...defaults, ...custom },
    }
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/detection/thresholds.test.ts
git add src/detection/thresholds.ts test/detection/thresholds.test.ts
git commit -m "feat(detection): ThresholdLoader merges feature_flags over defaults"
```
Expected: 3 passing.

---

## Task 3.4: Detection runner — evaluates rules and aggregates decisions

**Files:** create `cli/src/detection/runner.ts`, test `cli/test/detection/runner.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/runner.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { DetectionsRepo } from '../../src/db/repository.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { ThresholdLoader } from '../../src/detection/thresholds.js'
import { DetectionRunner } from '../../src/detection/runner.js'
import type { Rule } from '../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-runner-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

const warnRule: Rule = {
  id: 'R_warn', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'warn',
  hardBlockEligible: false, defaultThresholds: {},
  evaluate: () => ({ ruleId: 'R_warn', severity: 'warn', summary: 'warn me' }),
}
const blockRule: Rule = {
  id: 'R_block', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'warn',
  hardBlockEligible: true, defaultThresholds: {},
  evaluate: () => ({ ruleId: 'R_block', severity: 'warn', summary: 'block me' }),
}

describe('DetectionRunner', () => {
  it('aggregates severities: warn+warn→warn without block', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); reg.register(warnRule); reg.register({ ...warnRule, id: 'R_warn2' })
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db))
    const { detections, decision } = await runner.run({
      db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: false, now: () => 1,
    })
    expect(detections.length).toBe(2)
    expect(decision.decision).toBeUndefined()
  })

  it('block eligible + hardBlockEnabled → decision=block', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); reg.register(blockRule)
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db))
    const { decision } = await runner.run({
      db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: true, now: () => 1,
    })
    expect(decision.decision).toBe('block')
  })

  it('writes detections to DB', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); reg.register(warnRule)
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db))
    await runner.run({ db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: false, now: () => 1 })
    expect(new DetectionsRepo(db).recent(10).length).toBe(1)
  })

  it('honours 200ms budget — skips slow rules', async () => {
    const db = getDb(tmp)
    const slow: Rule = {
      id: 'R_slow', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'info',
      hardBlockEligible: false, defaultThresholds: {},
      evaluate: () => new Promise(res => setTimeout(() => res({ ruleId: 'R_slow', severity: 'info', summary: 's' }), 300)),
    }
    const reg = new RuleRegistry(); reg.register(slow)
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db), { budgetMs: 50 })
    const { detections } = await runner.run({
      db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: false, now: () => 1,
    })
    expect(detections.length).toBe(0)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/runner.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/runner.ts`:

```ts
import type Database from 'better-sqlite3'
import { DetectionsRepo } from '../db/repository.js'
import { RuleRegistry } from './registry.js'
import { ThresholdLoader } from './thresholds.js'
import type { Detection, DetectionContext, HookDecision, Rule, Severity } from './types.js'

export interface RunResult {
  detections: Detection[]
  decision: HookDecision
  latencyMs: number
}

export interface RunnerOptions {
  budgetMs?: number
}

const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warn: 1, block: 2 }

export class DetectionRunner {
  private budgetMs: number
  constructor(
    private db: Database.Database,
    private registry: RuleRegistry,
    private thresholds: ThresholdLoader,
    opts: RunnerOptions = {},
  ) {
    this.budgetMs = opts.budgetMs ?? 200
  }

  async run(ctx: DetectionContext): Promise<RunResult> {
    const started = Date.now()
    const rules = this.registry.byTrigger(ctx.trigger)
    const detections: Detection[] = []
    const detectionsRepo = new DetectionsRepo(this.db)

    for (const rule of rules) {
      const t = this.thresholds.load(rule.id, rule.defaultThresholds)
      if (!t.enabled) continue
      if (Date.now() - started >= this.budgetMs) break

      const ruleCtx: DetectionContext = {
        ...ctx,
        thresholds: t.thresholds,
        hardBlockEnabled: ctx.hardBlockEnabled && rule.hardBlockEligible && t.hardBlock,
      }
      const det = await this.evaluateSafe(rule, ruleCtx)
      if (!det) continue
      detections.push(det)
      detectionsRepo.insert({
        sessionId: ctx.sessionId ?? null,
        ruleId: det.ruleId,
        severity: det.severity,
        summary: det.summary,
        metadataJson: det.metadata ? JSON.stringify(det.metadata) : null,
        suggestedActionJson: det.suggestedAction ? JSON.stringify(det.suggestedAction) : null,
        createdAt: ctx.now(),
      })
    }

    const decision = this.aggregate(detections, ctx.hardBlockEnabled)
    const latencyMs = Date.now() - started
    return { detections, decision, latencyMs }
  }

  private async evaluateSafe(rule: Rule, ctx: DetectionContext): Promise<Detection | null> {
    try {
      const out = await Promise.race([
        Promise.resolve(rule.evaluate(ctx)),
        new Promise<null>(res => setTimeout(() => res(null), this.budgetMs)),
      ])
      return out ?? null
    } catch {
      return null
    }
  }

  private aggregate(detections: Detection[], hardBlockAllowed: boolean): HookDecision {
    let top: Detection | null = null
    for (const d of detections) {
      const effective = hardBlockAllowed && d.severity === 'warn' ? 'block' : d.severity
      if (!top || SEVERITY_ORDER[effective] > SEVERITY_ORDER[top.severity]) {
        top = { ...d, severity: effective }
      }
    }
    if (!top) return {}
    if (top.severity === 'block') {
      return { decision: 'block', reason: `tokscale: ${top.summary}` }
    }
    return { additionalContext: detections.map(d => `tokscale: ${d.summary}`).join('\n') }
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/detection/runner.test.ts
git add src/detection/runner.ts test/detection/runner.test.ts
git commit -m "feat(detection): DetectionRunner with severity aggregation + budget enforcement"
```
Expected: 4 passing.

---

## Task 3.5: Session-state in-memory cache

**Files:** create `cli/src/capture/session-state.ts`, test `cli/test/capture/session-state.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/capture/session-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SessionStateCache } from '../../src/capture/session-state.js'

describe('SessionStateCache', () => {
  it('tracks tool call args per session', () => {
    const cache = new SessionStateCache()
    cache.recordToolCall('s1', 'Read', 'hashA')
    cache.recordToolCall('s1', 'Read', 'hashA')
    expect(cache.countToolCalls('s1', 'Read', 'hashA')).toBe(2)
    expect(cache.countToolCalls('s1', 'Read', 'hashB')).toBe(0)
  })
  it('tracks cumulative tokens per session', () => {
    const cache = new SessionStateCache()
    cache.addTokens('s2', { input: 10, output: 5 })
    cache.addTokens('s2', { input: 20, output: 8 })
    const totals = cache.tokens('s2')
    expect(totals.input).toBe(30)
    expect(totals.output).toBe(13)
  })
  it('tracks failed-call count', () => {
    const cache = new SessionStateCache()
    cache.recordToolResult('s3', { succeeded: false })
    cache.recordToolResult('s3', { succeeded: false })
    cache.recordToolResult('s3', { succeeded: true })
    expect(cache.failedCount('s3')).toBe(2)
  })
  it('flushes on demand', () => {
    const cache = new SessionStateCache()
    cache.recordToolCall('s4', 'Read', 'h')
    cache.flush('s4')
    expect(cache.countToolCalls('s4', 'Read', 'h')).toBe(0)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/capture/session-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/capture/session-state.ts`:

```ts
interface TokenTotals { input: number; output: number; cacheRead: number; cacheWrite: number }

export class SessionStateCache {
  private toolCallCounts = new Map<string, Map<string, number>>()  // sessionId → `${tool}|${argsHash}` → count
  private tokens_ = new Map<string, TokenTotals>()
  private failures = new Map<string, number>()
  private turnCount = new Map<string, number>()

  recordToolCall(sessionId: string, toolName: string, argsHash: string): void {
    const key = `${toolName}|${argsHash}`
    const m = this.toolCallCounts.get(sessionId) ?? new Map()
    m.set(key, (m.get(key) ?? 0) + 1)
    this.toolCallCounts.set(sessionId, m)
  }
  countToolCalls(sessionId: string, toolName: string, argsHash: string): number {
    return this.toolCallCounts.get(sessionId)?.get(`${toolName}|${argsHash}`) ?? 0
  }
  addTokens(sessionId: string, delta: Partial<TokenTotals>): void {
    const t = this.tokens_.get(sessionId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    t.input += delta.input ?? 0
    t.output += delta.output ?? 0
    t.cacheRead += delta.cacheRead ?? 0
    t.cacheWrite += delta.cacheWrite ?? 0
    this.tokens_.set(sessionId, t)
  }
  tokens(sessionId: string): TokenTotals {
    return this.tokens_.get(sessionId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  }
  recordToolResult(sessionId: string, r: { succeeded: boolean }): void {
    if (!r.succeeded) this.failures.set(sessionId, (this.failures.get(sessionId) ?? 0) + 1)
  }
  failedCount(sessionId: string): number {
    return this.failures.get(sessionId) ?? 0
  }
  incrementTurn(sessionId: string): number {
    const v = (this.turnCount.get(sessionId) ?? 0) + 1
    this.turnCount.set(sessionId, v)
    return v
  }
  currentTurn(sessionId: string): number {
    return this.turnCount.get(sessionId) ?? 0
  }
  flush(sessionId: string): void {
    this.toolCallCounts.delete(sessionId)
    this.tokens_.delete(sessionId)
    this.failures.delete(sessionId)
    this.turnCount.delete(sessionId)
  }
}

export const sessionStateCache = new SessionStateCache()
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/capture/session-state.test.ts
git add src/capture/session-state.ts test/capture/session-state.test.ts
git commit -m "feat(capture): SessionStateCache for in-process per-session tallies"
```

---

## Task 3.6: Context builder — from hook payload to DetectionContext

**Files:** create `cli/src/detection/context-builder.ts`, test `cli/test/detection/context-builder.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/context-builder.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/context-builder.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/context-builder.ts`:

```ts
import type Database from 'better-sqlite3'
import type { DetectionContext, Trigger } from './types.js'

export interface HookPayload {
  session_id?: string
  hook_event_name: string
  tool_name?: string
  tool_input?: unknown
  tool_response?: unknown
  prompt?: string
  [key: string]: unknown
}

const TRIGGER_MAP: Record<string, Trigger> = {
  PreToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  UserPromptSubmit: 'UserPromptSubmit',
  Stop: 'Stop',
}

export function buildHookContext(db: Database.Database, payload: HookPayload): DetectionContext {
  const trigger = TRIGGER_MAP[payload.hook_event_name] ?? 'PostToolUse'
  return {
    db,
    trigger,
    sessionId: payload.session_id,
    toolName: payload.tool_name,
    toolInput: payload.tool_input,
    toolOutput: payload.tool_response,
    userPrompt: payload.prompt,
    timestamp: Date.now(),
    thresholds: {},
    hardBlockEnabled: true,
    now: () => Date.now(),
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/detection/context-builder.test.ts
git add src/detection/context-builder.ts test/detection/context-builder.test.ts
git commit -m "feat(detection): hook payload → DetectionContext builder"
```

---

## Task 3.7: Hint formatter registry

**Files:** create `cli/src/detection/hints/formatters.ts`, test `cli/test/detection/hints-formatters.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/hints-formatters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatHint } from '../../src/detection/hints/formatters.js'

describe('formatHint', () => {
  it('returns ruleId-prefixed summary when no formatter registered', () => {
    const msg = formatHint({ ruleId: 'X_unknown', severity: 'info', summary: 'hello' })
    expect(msg).toContain('X_unknown')
    expect(msg).toContain('hello')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/hints-formatters.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/hints/formatters.ts`:

```ts
import type { Detection } from '../types.js'

type Formatter = (d: Detection) => string

const registry = new Map<string, Formatter>()

export function registerFormatter(ruleId: string, fmt: Formatter): void {
  registry.set(ruleId, fmt)
}

export function formatHint(detection: Detection): string {
  const fmt = registry.get(detection.ruleId)
  if (fmt) return fmt(detection)
  return `[${detection.ruleId}] ${detection.summary}`
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/detection/hints-formatters.test.ts
git add src/detection/hints/formatters.ts test/detection/hints-formatters.test.ts
git commit -m "feat(detection): hint formatter registry with default fallback"
```

---

## Phase 3 verification gate

- [ ] Run full suite: `cd cli && npm run test:run`
- [ ] Run lint: `cd cli && npm run lint`
- [ ] Both green → proceed to Part 4 (hook infrastructure) before Phases 5 & 6 (rules).
- [ ] Update `cli/HANDOVER.md` section "Detection engine (new)" listing `src/detection/` with role of each file. Commit.
