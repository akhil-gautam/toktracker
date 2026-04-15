# Plan Part 4 — Phase 4: Hook Infrastructure

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: §7.

Depends on: Parts 1–3. Ships `tokscale hook install | uninstall | status | exec` so Claude Code can talk to the detection engine.

---

## Task 4.1: Hook settings.json mutator (marker-tagged, backed up)

**Files:** create `cli/src/hook/install.ts`, test `cli/test/hook/install.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/hook/install.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHook, uninstallHook, hookStatus } from '../../src/hook/install.js'

const dir = join(tmpdir(), `tokscale-hook-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const settings = join(dir, 'settings.json')

beforeEach(() => { writeFileSync(settings, JSON.stringify({}, null, 2)) })
afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('install / uninstall hook', () => {
  it('adds tokscale-managed entries for all four hook kinds', () => {
    installHook(settings, 'tokscale hook exec')
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    for (const k of ['PreToolUse','PostToolUse','UserPromptSubmit','Stop']) expect(s.hooks[k]).toBeTruthy()
    expect(existsSync(settings + '.tokscale-bak')).toBe(true)
  })
  it('is idempotent (no duplicates on repeat install)', () => {
    installHook(settings, 'tokscale hook exec')
    installHook(settings, 'tokscale hook exec')
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(s.hooks.PreToolUse.length).toBe(1)
  })
  it('preserves non-tokscale hook entries on uninstall', () => {
    writeFileSync(settings, JSON.stringify({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-tool' }] }] },
    }))
    installHook(settings, 'tokscale hook exec')
    uninstallHook(settings)
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(JSON.stringify(s.hooks.PreToolUse)).toContain('other-tool')
    expect(JSON.stringify(s.hooks.PreToolUse)).not.toContain('tokscale')
  })
  it('status reports installed scope', () => {
    installHook(settings, 'tokscale hook exec')
    expect(hookStatus(settings).installed).toBe(true)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/hook/install.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/hook/install.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'

const TOKSCALE_MARKER = '__tokscale_managed__'
const HOOK_KINDS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'] as const

interface Entry {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string; [TOKSCALE_MARKER]?: boolean }>
}

export interface HookStatus {
  installed: boolean
  kinds: string[]
}

function readSettings(path: string): any {
  if (!existsSync(path)) return {}
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return {} }
}

function writeSettings(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

function entryFor(kind: string, command: string): Entry {
  const base: Entry = { hooks: [{ type: 'command', command: `${command} ${kind}`, [TOKSCALE_MARKER]: true }] }
  if (kind === 'PreToolUse' || kind === 'PostToolUse') base.matcher = '*'
  return base
}

export function installHook(settingsPath: string, command: string): void {
  if (!existsSync(settingsPath + '.tokscale-bak') && existsSync(settingsPath)) {
    copyFileSync(settingsPath, settingsPath + '.tokscale-bak')
  }
  const s = readSettings(settingsPath)
  s.hooks = s.hooks ?? {}
  for (const kind of HOOK_KINDS) {
    const existing: Entry[] = s.hooks[kind] ?? []
    const filtered = existing.filter(e => !isTokscaleEntry(e))
    filtered.push(entryFor(kind, command))
    s.hooks[kind] = filtered
  }
  writeSettings(settingsPath, s)
}

export function uninstallHook(settingsPath: string): void {
  const s = readSettings(settingsPath)
  if (!s.hooks) return
  for (const kind of HOOK_KINDS) {
    const existing: Entry[] = s.hooks[kind] ?? []
    const filtered = existing.filter(e => !isTokscaleEntry(e))
    if (filtered.length > 0) s.hooks[kind] = filtered
    else delete s.hooks[kind]
  }
  if (Object.keys(s.hooks).length === 0) delete s.hooks
  writeSettings(settingsPath, s)
}

export function hookStatus(settingsPath: string): HookStatus {
  const s = readSettings(settingsPath)
  const kinds: string[] = []
  for (const kind of HOOK_KINDS) {
    const entries: Entry[] = s.hooks?.[kind] ?? []
    if (entries.some(isTokscaleEntry)) kinds.push(kind)
  }
  return { installed: kinds.length === HOOK_KINDS.length, kinds }
}

function isTokscaleEntry(e: Entry): boolean {
  return (e.hooks ?? []).some(h => h[TOKSCALE_MARKER] === true)
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/hook/install.test.ts
git add src/hook/install.ts test/hook/install.test.ts
git commit -m "feat(hook): install/uninstall/status with marker-tagged, idempotent settings edits"
```
Expected: 4 passing.

---

## Task 4.2: Rotating log

**Files:** create `cli/src/hook/log.ts`, test `cli/test/hook/log.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/hook/log.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HookLogger } from '../../src/hook/log.js'

const dir = join(tmpdir(), `tokscale-log-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const logFile = join(dir, 'hook.log')

afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('HookLogger', () => {
  it('writes a line with timestamp', () => {
    const log = new HookLogger(logFile, 1024)
    log.write('hello')
    expect(readFileSync(logFile, 'utf8')).toContain('hello')
  })
  it('rotates when over byte cap', () => {
    writeFileSync(logFile, 'x'.repeat(2048))
    const log = new HookLogger(logFile, 1024)
    log.write('new')
    expect(statSync(logFile).size).toBeLessThanOrEqual(1024 + 200)
    expect(existsSync(logFile + '.1')).toBe(true)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/hook/log.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/hook/log.ts`:

```ts
import { appendFileSync, existsSync, renameSync, statSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export class HookLogger {
  constructor(private path: string, private maxBytes: number = 10 * 1024 * 1024) {
    mkdirSync(dirname(path), { recursive: true })
  }
  write(message: string): void {
    try {
      if (existsSync(this.path) && statSync(this.path).size >= this.maxBytes) {
        renameSync(this.path, this.path + '.1')
      }
    } catch {}
    try {
      appendFileSync(this.path, `${new Date().toISOString()} ${message}\n`)
    } catch {}
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/hook/log.test.ts
git add src/hook/log.ts test/hook/log.test.ts
git commit -m "feat(hook): rotating log writer"
```
Expected: 2 passing.

---

## Task 4.3: Hook exec entry point — stdin/stdout JSON contract

**Files:** create `cli/src/hook/exec.ts`, test `cli/test/hook/exec.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/hook/exec.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/hook/exec.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/hook/exec.ts`:

```ts
import type Database from 'better-sqlite3'
import { HookEventsRepo } from '../db/repository.js'
import { RuleRegistry } from '../detection/registry.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import { DetectionRunner } from '../detection/runner.js'
import { buildHookContext, type HookPayload } from '../detection/context-builder.js'
import { HookLogger } from './log.js'
import type { HookDecision } from '../detection/types.js'

export interface HookExecArgs {
  kind: string
  payload: HookPayload
  db: Database.Database
  registry: RuleRegistry
  logPath: string
  budgetMs?: number
}

const VALID_KINDS = new Set(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'])

export async function runHookExec(args: HookExecArgs): Promise<HookDecision> {
  const logger = new HookLogger(args.logPath)
  if (!VALID_KINDS.has(args.kind)) { logger.write(`unknown kind=${args.kind}`); return {} }
  const start = Date.now()
  const ctx = buildHookContext(args.db, { ...args.payload, hook_event_name: args.kind })
  const runner = new DetectionRunner(args.db, args.registry, new ThresholdLoader(args.db), { budgetMs: args.budgetMs ?? 200 })

  let decision: HookDecision = {}
  try {
    const result = await runner.run(ctx)
    decision = result.decision
    new HookEventsRepo(args.db).insert({
      sessionId: ctx.sessionId ?? null,
      hookKind: args.kind,
      payloadJson: JSON.stringify(args.payload),
      decision: decision.decision ?? null,
      reason: decision.reason ?? null,
      latencyMs: result.latencyMs,
      createdAt: Date.now(),
    })
  } catch (err) {
    logger.write(`error: ${(err as Error).message}`)
    new HookEventsRepo(args.db).insert({
      sessionId: ctx.sessionId ?? null,
      hookKind: args.kind,
      payloadJson: JSON.stringify(args.payload),
      decision: null, reason: null, latencyMs: Date.now() - start,
      createdAt: Date.now(),
    })
  }
  return decision
}

export async function readStdinJson(): Promise<HookPayload> {
  return new Promise((resolve, reject) => {
    let buf = ''
    process.stdin.on('data', d => { buf += d.toString() })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')) } catch (e) { reject(e as Error) }
    })
    process.stdin.on('error', e => reject(e))
  })
}

export function emit(response: HookDecision): void {
  process.stdout.write(JSON.stringify(response))
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/hook/exec.test.ts
git add src/hook/exec.ts test/hook/exec.test.ts
git commit -m "feat(hook): exec entry runs DetectionRunner + persists hook_events + returns decision"
```
Expected: 3 passing.

---

## Task 4.4: Schema-version compatibility check

**Files:** create `cli/src/hook/schema-version.ts`, test `cli/test/hook/schema-version.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/hook/schema-version.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { supportsPayload } from '../../src/hook/schema-version.js'

describe('supportsPayload', () => {
  it('known field set → supported', () => {
    expect(supportsPayload({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'X', tool_input: {} }).supported).toBe(true)
  })
  it('missing hook_event_name → unsupported', () => {
    expect(supportsPayload({ session_id: 's' }).supported).toBe(false)
  })
  it('extra unknown fields → supported (forward compatible)', () => {
    expect(supportsPayload({ hook_event_name: 'PreToolUse', future_field: 42 }).supported).toBe(true)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/hook/schema-version.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/hook/schema-version.ts`:

```ts
export interface CompatibilityReport {
  supported: boolean
  missing: string[]
}

export function supportsPayload(payload: Record<string, unknown>): CompatibilityReport {
  const required = ['hook_event_name']
  const missing = required.filter(k => !(k in payload))
  return { supported: missing.length === 0, missing }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/hook/schema-version.test.ts
git add src/hook/schema-version.ts test/hook/schema-version.test.ts
git commit -m "feat(hook): payload schema compatibility check"
```

---

## Task 4.5: Hook CLI commands (commander)

**Files:** create `cli/src/cli/index.ts`, `cli/src/cli/hook-commands.ts`, test `cli/test/cli/hook-commands.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/cli/hook-commands.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { registerHookCommands } from '../../src/cli/hook-commands.js'

const dir = join(tmpdir(), `tokscale-hookcli-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const settings = join(dir, 'settings.json')

beforeEach(() => { writeFileSync(settings, JSON.stringify({})) })
afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('hook CLI commands', () => {
  it('install writes entries to settings.json', async () => {
    const program = new Command()
    registerHookCommands(program, { resolveSettingsPath: () => settings })
    await program.parseAsync(['node', 'cli', 'hook', 'install', '--local'])
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(s.hooks.PreToolUse).toBeTruthy()
  })
  it('uninstall removes entries', async () => {
    const program = new Command()
    registerHookCommands(program, { resolveSettingsPath: () => settings })
    await program.parseAsync(['node', 'cli', 'hook', 'install', '--local'])
    await program.parseAsync(['node', 'cli', 'hook', 'uninstall', '--local'])
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(s.hooks).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/cli/hook-commands.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/cli/hook-commands.ts`:

```ts
import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { installHook, uninstallHook, hookStatus } from '../hook/install.js'

export interface HookCommandDeps {
  resolveSettingsPath?: (scope: 'global' | 'local') => string
  hookBinary?: string
}

function defaultSettingsPath(scope: 'global' | 'local'): string {
  if (scope === 'global') return join(homedir(), '.claude', 'settings.json')
  return join(process.cwd(), '.claude', 'settings.json')
}

export function registerHookCommands(program: Command, deps: HookCommandDeps = {}): void {
  const resolve = deps.resolveSettingsPath ?? defaultSettingsPath
  const hookBinary = deps.hookBinary ?? 'tokscale hook exec'
  const hook = program.command('hook').description('Manage Claude Code hooks')

  hook.command('install')
    .option('--global', 'install to ~/.claude/settings.json')
    .option('--local', 'install to ./.claude/settings.json', true)
    .action((opts) => {
      const scope = opts.global ? 'global' : 'local'
      const path = resolve(scope)
      installHook(path, hookBinary)
      process.stdout.write(`installed to ${path}\n`)
    })

  hook.command('uninstall')
    .option('--global', '')
    .option('--local', '', true)
    .action((opts) => {
      const scope = opts.global ? 'global' : 'local'
      const path = resolve(scope)
      uninstallHook(path)
      process.stdout.write(`uninstalled from ${path}\n`)
    })

  hook.command('status')
    .option('--global', '')
    .option('--local', '', true)
    .action((opts) => {
      const scope = opts.global ? 'global' : 'local'
      const path = resolve(scope)
      const s = hookStatus(path)
      process.stdout.write(JSON.stringify(s, null, 2) + '\n')
    })

  hook.command('exec <kind>')
    .description('internal: invoked by Claude Code with JSON payload on stdin')
    .action(async (kind: string) => {
      const { runHookExec, readStdinJson, emit } = await import('../hook/exec.js')
      const { bootDb } = await import('../db/boot.js')
      const { RuleRegistry } = await import('../detection/registry.js')
      const { hookLogPath } = await import('../db/paths.js')
      const payload = await readStdinJson()
      const db = bootDb()
      const registry = new RuleRegistry()
      const { registerAllRules } = await import('../detection/rules/index.js').catch(() => ({ registerAllRules: () => {} }))
      registerAllRules(registry)
      const decision = await runHookExec({ kind, payload, db, registry, logPath: hookLogPath() })
      emit(decision)
    })
}
```

- [ ] **Step 4: Create CLI entry**

Write to `cli/src/cli/index.ts`:

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { registerHookCommands } from './hook-commands.js'

const program = new Command()
program.name('tokscale').description('AI coding tool tracker').version('0.2.0')
registerHookCommands(program)
program.parseAsync(process.argv).catch(err => {
  process.stderr.write(`error: ${err.message}\n`)
  process.exit(1)
})
```

- [ ] **Step 5: Stub rules index (filled in Parts 5 & 6)**

Write to `cli/src/detection/rules/index.ts`:

```ts
import type { RuleRegistry } from '../registry.js'

export function registerAllRules(_registry: RuleRegistry): void {
  // Individual rule registrations are added in Parts 5 & 6.
}
```

- [ ] **Step 6: Verify + commit**

```bash
cd cli && npx vitest run test/cli/hook-commands.test.ts
npm run lint
git add src/cli src/detection/rules/index.ts test/cli
git commit -m "feat(cli): hook install/uninstall/status/exec commands"
```
Expected: 2 passing, lint clean.

---

## Task 4.6: Wire the CLI binary

**Files:** modify `cli/bin/tokscale.js`, `cli/package.json`, `cli/tsup.config.ts`

- [ ] **Step 1: Read current bin**

Run: `cd cli && cat bin/tokscale.js`

- [ ] **Step 2: Update bin to dispatch between TUI and subcommands**

Replace `cli/bin/tokscale.js` with:

```js
#!/usr/bin/env node
import { argv } from 'node:process'

const hasSubcommand = argv.length > 2 && !argv[2].startsWith('-')

if (hasSubcommand) {
  await import('../dist/cli.js')
} else {
  await import('../dist/index.js')
}
```

- [ ] **Step 3: Add second entry point to tsup**

Update `cli/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.tsx',
    cli: 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  loader: { '.sql': 'copy' },
  onSuccess: 'cp src/db/schema.sql dist/schema.sql',
})
```

- [ ] **Step 4: Build + smoke test**

```bash
cd cli && npm run build
./bin/tokscale.js hook status --local
```
Expected: JSON status printed.

- [ ] **Step 5: Commit**

```bash
cd cli && git add bin/tokscale.js tsup.config.ts
git commit -m "feat(cli): dispatch subcommands via cli entry point"
```

---

## Phase 4 verification gate

- [ ] Run full suite: `cd cli && npm run test:run`
- [ ] Run lint: `cd cli && npm run lint`
- [ ] Manual smoke: `./bin/tokscale.js hook install --local` then inspect `.claude/settings.json` in repo root; then `./bin/tokscale.js hook uninstall --local` and re-inspect.
- [ ] Proceed to Part 5 (Category A + C rules).
- [ ] Update `cli/HANDOVER.md` section "Hook (new)" listing `src/hook/`, `src/cli/`, hook install paths. Commit.
