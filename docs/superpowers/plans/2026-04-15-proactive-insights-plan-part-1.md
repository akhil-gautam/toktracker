# Plan Part 1 — Phase 1: Storage Foundation

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: `docs/superpowers/specs/2026-04-15-proactive-insights-design.md`

All paths relative to repo root. CLI workdir is `cli/`.

---

## Task 1.1: Install commander + node-notifier deps

**Files:** modify `cli/package.json`

- [ ] **Step 1: Add runtime deps**

Run: `cd cli && npm install commander@^12.1.0 node-notifier@^10.0.1`

- [ ] **Step 2: Add type deps**

Run: `cd cli && npm install -D @types/node-notifier@^8.0.5`

- [ ] **Step 3: Verify**

Run: `cd cli && node -e "const p = require('./package.json'); console.log(p.dependencies.commander, p.dependencies['node-notifier'])"`
Expected: both versions print non-undefined.

- [ ] **Step 4: Commit**

```bash
cd cli && git add package.json package-lock.json
git commit -m "chore(cli): add commander + node-notifier deps for insights layer"
```

---

## Task 1.2: Create DB schema file

**Files:** create `cli/src/db/schema.sql`

- [ ] **Step 1: Write schema file**

Write to `cli/src/db/schema.sql` verbatim:

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  tool            TEXT NOT NULL,
  model           TEXT NOT NULL,
  cwd             TEXT,
  git_repo        TEXT,
  git_branch      TEXT,
  git_commit_start TEXT,
  git_commit_end  TEXT,
  started_at      INTEGER NOT NULL,
  ended_at        INTEGER,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cache_read      INTEGER DEFAULT 0,
  cache_write     INTEGER DEFAULT 0,
  cost_millicents INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(git_repo, started_at);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  turn_index      INTEGER NOT NULL,
  role            TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  content_redacted TEXT,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  cache_read      INTEGER DEFAULT 0,
  cache_write     INTEGER DEFAULT 0,
  thinking_tokens INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_messages_hash ON messages(content_hash);

CREATE TABLE IF NOT EXISTS tool_calls (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id      INTEGER NOT NULL REFERENCES messages(id),
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  tool_name       TEXT NOT NULL,
  args_hash       TEXT NOT NULL,
  args_json       TEXT,
  target_path     TEXT,
  succeeded       INTEGER,
  tokens_returned INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_calls_session_args ON tool_calls(session_id, tool_name, args_hash);
CREATE INDEX IF NOT EXISTS idx_tool_calls_path ON tool_calls(target_path);

CREATE TABLE IF NOT EXISTS hook_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT,
  hook_kind       TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  decision        TEXT,
  reason          TEXT,
  latency_ms      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hook_events_session ON hook_events(session_id, created_at);

CREATE TABLE IF NOT EXISTS git_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  sha             TEXT,
  pr_number       INTEGER,
  branch          TEXT,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_git_events_dedup ON git_events(repo, kind, COALESCE(sha,''), COALESCE(pr_number,0));

CREATE TABLE IF NOT EXISTS detections (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT,
  rule_id         TEXT NOT NULL,
  severity        TEXT NOT NULL,
  summary         TEXT NOT NULL,
  metadata_json   TEXT,
  suggested_action_json TEXT,
  acknowledged_at INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_detections_rule ON detections(rule_id, created_at);
CREATE INDEX IF NOT EXISTS idx_detections_session ON detections(session_id);

CREATE TABLE IF NOT EXISTS redaction_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern         TEXT NOT NULL,
  replacement     TEXT NOT NULL DEFAULT '[REDACTED]',
  enabled         INTEGER NOT NULL DEFAULT 1,
  builtin         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_flags (
  key             TEXT PRIMARY KEY,
  enabled         INTEGER NOT NULL DEFAULT 0,
  config_json     TEXT
);

CREATE TABLE IF NOT EXISTS pr_attributions (
  pr_number       INTEGER NOT NULL,
  repo            TEXT NOT NULL,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  overlap_kind    TEXT NOT NULL,
  confidence      REAL NOT NULL,
  PRIMARY KEY (pr_number, repo, session_id)
);

CREATE TABLE IF NOT EXISTS batch_runs (
  job_name        TEXT PRIMARY KEY,
  last_run_at     INTEGER NOT NULL,
  last_status     TEXT NOT NULL
);
```

- [ ] **Step 2: Commit**

```bash
cd cli && git add src/db/schema.sql
git commit -m "feat(db): SQLite schema for proactive insights tables"
```

---

## Task 1.3: DB connection singleton with WAL mode

**Files:** create `cli/src/db/connection.ts`, test `cli/test/db/connection.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/db/connection.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'

const tmp = join(tmpdir(), `tokscale-conn-${Date.now()}.db`)

afterEach(() => {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) {
    try { rmSync(tmp + suffix) } catch {}
  }
})

describe('db connection', () => {
  it('opens DB in WAL mode with busy_timeout >= 5000', () => {
    const db = getDb(tmp)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(Number(db.pragma('busy_timeout', { simple: true }))).toBeGreaterThanOrEqual(5000)
  })
  it('returns same instance on repeated calls with same path', () => {
    const a = getDb(tmp)
    const b = getDb(tmp)
    expect(a).toBe(b)
  })
})
```

- [ ] **Step 2: Run — should fail**

Run: `cd cli && npx vitest run test/db/connection.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Write to `cli/src/db/connection.ts`:

```ts
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let instance: Database.Database | null = null
let currentPath: string | null = null

export function getDb(path: string): Database.Database {
  if (instance && currentPath === path) return instance
  if (instance) instance.close()
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  instance = db
  currentPath = path
  return db
}

export function closeDb(): void {
  if (instance) {
    instance.close()
    instance = null
    currentPath = null
  }
}
```

- [ ] **Step 4: Verify pass**

Run: `cd cli && npx vitest run test/db/connection.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
cd cli && git add src/db/connection.ts test/db/connection.test.ts
git commit -m "feat(db): WAL-mode connection singleton with busy_timeout"
```

---

## Task 1.4: Migrate runner + schema.sql ship

**Files:** create `cli/src/db/migrate.ts`, test `cli/test/db/migrate.test.ts`, modify `cli/tsup.config.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/db/migrate.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'

const tmp = join(tmpdir(), `tokscale-migrate-${Date.now()}.db`)

afterEach(() => {
  closeDb()
  for (const suffix of ['', '-wal', '-shm']) { try { rmSync(tmp + suffix) } catch {} }
})

describe('migrate', () => {
  it('creates all tables on fresh DB', () => {
    const db = getDb(tmp)
    migrate(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    for (const t of ['batch_runs','detections','feature_flags','git_events','hook_events','messages','pr_attributions','redaction_rules','schema_version','sessions','tool_calls']) {
      expect(names).toContain(t)
    }
  })
  it('is idempotent', () => {
    const db = getDb(tmp)
    migrate(db)
    expect(() => migrate(db)).not.toThrow()
    const v = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number }
    expect(v.v).toBe(1)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/db/migrate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement migrate**

Write to `cli/src/db/migrate.ts`:

```ts
import type Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(here, 'schema.sql')
const TARGET_VERSION = 1

export interface MigrateOptions {
  legacyDir?: string
}

export function migrate(db: Database.Database, opts: MigrateOptions = {}): void {
  const sql = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(sql)
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
  const current = row.v ?? 0
  if (current < TARGET_VERSION) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(TARGET_VERSION, Date.now())
  }
  if (opts.legacyDir) importLegacy(db, opts.legacyDir)
}

function importLegacy(db: Database.Database, dir: string): void {
  const budgets = join(dir, 'budgets.json')
  if (existsSync(budgets)) {
    const data = JSON.parse(readFileSync(budgets, 'utf8'))
    db.prepare(`INSERT OR REPLACE INTO feature_flags (key, enabled, config_json) VALUES ('legacy_budgets', 1, ?)`).run(JSON.stringify(data))
  }
  const state = join(dir, 'state.json')
  if (existsSync(state)) {
    const data = JSON.parse(readFileSync(state, 'utf8'))
    db.prepare(`INSERT OR REPLACE INTO feature_flags (key, enabled, config_json) VALUES ('legacy_cursors', 1, ?)`).run(JSON.stringify(data))
  }
}
```

- [ ] **Step 4: Ensure schema.sql is shipped by tsup**

Overwrite `cli/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  loader: { '.sql': 'copy' },
  onSuccess: 'cp src/db/schema.sql dist/schema.sql',
})
```

- [ ] **Step 5: Verify pass**

Run: `cd cli && npx vitest run test/db/migrate.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
cd cli && git add src/db/migrate.ts test/db/migrate.test.ts tsup.config.ts
git commit -m "feat(db): migrate runner applies schema.sql with version tracking"
```

---

## Task 1.5: Legacy importer test

**Files:** modify `cli/test/db/migrate.test.ts`

- [ ] **Step 1: Append failing test**

Append to `cli/test/db/migrate.test.ts`:

```ts
import { writeFileSync, mkdirSync } from 'node:fs'

describe('legacy importer', () => {
  it('imports budgets.json into feature_flags scope', () => {
    const dir = join(tmpdir(), `tokscale-legacy-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'budgets.json'), JSON.stringify([
      { id: 'b1', scope: 'global', period: 'daily', limitCents: 5000, alertAtPct: 80 },
    ]))
    const dbPath = join(dir, 'toktracker.db')
    const db = getDb(dbPath)
    migrate(db, { legacyDir: dir })
    const row = db.prepare("SELECT config_json FROM feature_flags WHERE key='legacy_budgets'").get() as { config_json: string }
    expect(row).toBeDefined()
    expect(JSON.parse(row.config_json)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run expecting pass**

Run: `cd cli && npx vitest run test/db/migrate.test.ts`
Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
cd cli && git add test/db/migrate.test.ts
git commit -m "test(db): cover legacy importer path through migrate"
```

---

## Task 1.6: Config path resolver

**Files:** create `cli/src/db/paths.ts`, test `cli/test/db/paths.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/db/paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { configDir, dbPath, hookLogPath, modelsDir, pidFilePath } from '../../src/db/paths.js'

describe('paths', () => {
  it('resolves config dir ending in "tokscale"', () => {
    expect(configDir().endsWith('tokscale')).toBe(true)
  })
  it('joins db path under config dir', () => {
    expect(dbPath()).toBe(configDir() + '/toktracker.db')
  })
  it('exposes hook log + models + pid paths', () => {
    expect(hookLogPath()).toContain('hook.log')
    expect(modelsDir()).toContain('models')
    expect(pidFilePath()).toContain('daemon.pid')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/db/paths.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/db/paths.ts`:

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'

export function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg ? xdg : join(homedir(), '.config')
  return join(base, 'tokscale')
}

export function dbPath(): string {
  return join(configDir(), 'toktracker.db')
}

export function hookLogPath(): string {
  return join(configDir(), 'hook.log')
}

export function modelsDir(): string {
  return join(configDir(), 'models')
}

export function pidFilePath(): string {
  return join(configDir(), 'daemon.pid')
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/db/paths.test.ts
git add src/db/paths.ts test/db/paths.test.ts
git commit -m "feat(db): XDG-aware config path resolver"
```
Expected: 3 passing.

---

## Task 1.7: Typed repositories — Sessions / Messages / ToolCalls

**Files:** create `cli/src/db/repository.ts`, test `cli/test/db/repository.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/db/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../src/db/repository.js'

const tmp = join(tmpdir(), `tokscale-repo-${Date.now()}.db`)

beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('SessionsRepo', () => {
  it('upserts and finds by id', () => {
    const repo = new SessionsRepo(getDb(tmp))
    repo.upsert({ id: 's1', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1000 })
    expect(repo.findById('s1')?.model).toBe('claude-opus-4-6')
  })
})

describe('MessagesRepo + ToolCallsRepo', () => {
  it('inserts rows tied to a session', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's2', tool: 'claude_code', model: 'sonnet', startedAt: 2000 })
    const msg = new MessagesRepo(db).insert({ sessionId: 's2', turnIndex: 0, role: 'user', contentHash: 'h1', inputTokens: 100, createdAt: 2001 })
    expect(msg.id).toBeGreaterThan(0)
    const tc = new ToolCallsRepo(db).insert({ messageId: msg.id!, sessionId: 's2', toolName: 'Read', argsHash: 'a1', targetPath: '/x', createdAt: 2002 })
    expect(tc.id).toBeGreaterThan(0)
    expect(new ToolCallsRepo(db).findBySessionToolArgs('s2', 'Read', 'a1').length).toBe(1)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/db/repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement repositories**

Write to `cli/src/db/repository.ts`:

```ts
import type Database from 'better-sqlite3'

export interface SessionRow {
  id: string
  tool: string
  model: string
  cwd?: string | null
  gitRepo?: string | null
  gitBranch?: string | null
  gitCommitStart?: string | null
  gitCommitEnd?: string | null
  startedAt: number
  endedAt?: number | null
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  costMillicents?: number
}

export class SessionsRepo {
  constructor(private db: Database.Database) {}
  upsert(s: SessionRow): void {
    this.db.prepare(`
      INSERT INTO sessions (id, tool, model, cwd, git_repo, git_branch, git_commit_start, git_commit_end,
        started_at, ended_at, input_tokens, output_tokens, cache_read, cache_write, cost_millicents)
      VALUES (@id, @tool, @model, @cwd, @gitRepo, @gitBranch, @gitCommitStart, @gitCommitEnd,
        @startedAt, @endedAt, @inputTokens, @outputTokens, @cacheRead, @cacheWrite, @costMillicents)
      ON CONFLICT(id) DO UPDATE SET
        ended_at = excluded.ended_at,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_read = excluded.cache_read,
        cache_write = excluded.cache_write,
        cost_millicents = excluded.cost_millicents,
        git_commit_end = excluded.git_commit_end
    `).run({
      id: s.id, tool: s.tool, model: s.model,
      cwd: s.cwd ?? null, gitRepo: s.gitRepo ?? null, gitBranch: s.gitBranch ?? null,
      gitCommitStart: s.gitCommitStart ?? null, gitCommitEnd: s.gitCommitEnd ?? null,
      startedAt: s.startedAt, endedAt: s.endedAt ?? null,
      inputTokens: s.inputTokens ?? 0, outputTokens: s.outputTokens ?? 0,
      cacheRead: s.cacheRead ?? 0, cacheWrite: s.cacheWrite ?? 0,
      costMillicents: s.costMillicents ?? 0,
    })
  }
  findById(id: string): SessionRow | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
    return r ? toSessionRow(r) : null
  }
  findInRange(sinceMs: number, untilMs: number): SessionRow[] {
    return (this.db.prepare('SELECT * FROM sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at').all(sinceMs, untilMs) as any[]).map(toSessionRow)
  }
}

function toSessionRow(r: any): SessionRow {
  return {
    id: r.id, tool: r.tool, model: r.model, cwd: r.cwd,
    gitRepo: r.git_repo, gitBranch: r.git_branch,
    gitCommitStart: r.git_commit_start, gitCommitEnd: r.git_commit_end,
    startedAt: r.started_at, endedAt: r.ended_at,
    inputTokens: r.input_tokens, outputTokens: r.output_tokens,
    cacheRead: r.cache_read, cacheWrite: r.cache_write, costMillicents: r.cost_millicents,
  }
}

export interface MessageRow {
  id?: number
  sessionId: string
  turnIndex: number
  role: string
  contentHash: string
  contentRedacted?: string | null
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
  createdAt: number
}

export class MessagesRepo {
  constructor(private db: Database.Database) {}
  insert(m: MessageRow): MessageRow {
    const info = this.db.prepare(`
      INSERT INTO messages (session_id, turn_index, role, content_hash, content_redacted,
        input_tokens, output_tokens, cache_read, cache_write, thinking_tokens, created_at)
      VALUES (@sessionId, @turnIndex, @role, @contentHash, @contentRedacted,
        @inputTokens, @outputTokens, @cacheRead, @cacheWrite, @thinkingTokens, @createdAt)
    `).run({
      sessionId: m.sessionId, turnIndex: m.turnIndex, role: m.role,
      contentHash: m.contentHash, contentRedacted: m.contentRedacted ?? null,
      inputTokens: m.inputTokens ?? 0, outputTokens: m.outputTokens ?? 0,
      cacheRead: m.cacheRead ?? 0, cacheWrite: m.cacheWrite ?? 0,
      thinkingTokens: m.thinkingTokens ?? 0, createdAt: m.createdAt,
    })
    return { ...m, id: Number(info.lastInsertRowid) }
  }
  findBySession(sessionId: string): MessageRow[] {
    return (this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY turn_index').all(sessionId) as any[])
      .map(r => ({
        id: r.id, sessionId: r.session_id, turnIndex: r.turn_index, role: r.role,
        contentHash: r.content_hash, contentRedacted: r.content_redacted,
        inputTokens: r.input_tokens, outputTokens: r.output_tokens,
        cacheRead: r.cache_read, cacheWrite: r.cache_write,
        thinkingTokens: r.thinking_tokens, createdAt: r.created_at,
      }))
  }
  countByHashSince(contentHash: string, sinceMs: number): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM messages WHERE content_hash = ? AND created_at >= ?').get(contentHash, sinceMs) as { c: number }).c
  }
}

export interface ToolCallRow {
  id?: number
  messageId: number
  sessionId: string
  toolName: string
  argsHash: string
  argsJson?: string | null
  targetPath?: string | null
  succeeded?: number | null
  tokensReturned?: number
  createdAt: number
}

export class ToolCallsRepo {
  constructor(private db: Database.Database) {}
  insert(t: ToolCallRow): ToolCallRow {
    const info = this.db.prepare(`
      INSERT INTO tool_calls (message_id, session_id, tool_name, args_hash, args_json,
        target_path, succeeded, tokens_returned, created_at)
      VALUES (@messageId, @sessionId, @toolName, @argsHash, @argsJson,
        @targetPath, @succeeded, @tokensReturned, @createdAt)
    `).run({
      messageId: t.messageId, sessionId: t.sessionId, toolName: t.toolName,
      argsHash: t.argsHash, argsJson: t.argsJson ?? null,
      targetPath: t.targetPath ?? null, succeeded: t.succeeded ?? null,
      tokensReturned: t.tokensReturned ?? 0, createdAt: t.createdAt,
    })
    return { ...t, id: Number(info.lastInsertRowid) }
  }
  findBySessionToolArgs(sessionId: string, toolName: string, argsHash: string): ToolCallRow[] {
    return (this.db.prepare(
      'SELECT * FROM tool_calls WHERE session_id = ? AND tool_name = ? AND args_hash = ? ORDER BY created_at'
    ).all(sessionId, toolName, argsHash) as any[]).map(r => ({
      id: r.id, messageId: r.message_id, sessionId: r.session_id, toolName: r.tool_name,
      argsHash: r.args_hash, argsJson: r.args_json, targetPath: r.target_path,
      succeeded: r.succeeded, tokensReturned: r.tokens_returned, createdAt: r.created_at,
    }))
  }
  countDistinctSessionsForPath(targetPath: string, sinceMs: number): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT session_id) as c FROM tool_calls WHERE target_path = ? AND created_at >= ?').get(targetPath, sinceMs) as { c: number }).c
  }
  failedCountInSession(sessionId: string): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM tool_calls WHERE session_id = ? AND succeeded = 0').get(sessionId) as { c: number }).c
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/db/repository.test.ts
git add src/db/repository.ts test/db/repository.test.ts
git commit -m "feat(db): typed repositories for sessions, messages, tool_calls"
```
Expected: 2 passing.

---

## Task 1.8: Remaining repositories

**Files:** modify `cli/src/db/repository.ts`, `cli/test/db/repository.test.ts`

- [ ] **Step 1: Append failing test**

Append to `cli/test/db/repository.test.ts`:

```ts
import { HookEventsRepo, GitEventsRepo, DetectionsRepo, FeatureFlagsRepo, PrAttributionsRepo, BatchRunsRepo } from '../../src/db/repository.js'

describe('remaining repos', () => {
  it('persists each row type', () => {
    const db = getDb(tmp)
    const he = new HookEventsRepo(db).insert({ sessionId: null, hookKind: 'PreToolUse', payloadJson: '{}', createdAt: 1 })
    expect(he.id).toBeGreaterThan(0)
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 12, createdAt: 2 })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 12, createdAt: 3 })
    expect(new GitEventsRepo(db).findByRepo('a/b').length).toBe(1)
    new SessionsRepo(db).upsert({ id: 's9', tool: 'claude_code', model: 'm', startedAt: 1 })
    new DetectionsRepo(db).insert({ sessionId: 's9', ruleId: 'A1_redundant_tool_call', severity: 'warn', summary: 'x', createdAt: 4 })
    expect(new DetectionsRepo(db).recent(10).length).toBe(1)
    new FeatureFlagsRepo(db).set('A1_redundant_tool_call', { enabled: true, hard_block: false })
    expect(new FeatureFlagsRepo(db).get('A1_redundant_tool_call')?.enabled).toBe(1)
    new PrAttributionsRepo(db).upsert({ prNumber: 12, repo: 'a/b', sessionId: 's9', overlapKind: 'branch_match', confidence: 0.9 })
    expect(new PrAttributionsRepo(db).findByPr('a/b', 12).length).toBe(1)
    new BatchRunsRepo(db).mark('b6_clustering', 'ok', 100)
    expect(new BatchRunsRepo(db).lastRunAt('b6_clustering')).toBe(100)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/db/repository.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append implementations to `cli/src/db/repository.ts`**

```ts
export interface HookEventRow {
  id?: number
  sessionId: string | null
  hookKind: string
  payloadJson: string
  decision?: string | null
  reason?: string | null
  latencyMs?: number | null
  createdAt: number
}

export class HookEventsRepo {
  constructor(private db: Database.Database) {}
  insert(h: HookEventRow): HookEventRow {
    const info = this.db.prepare(`
      INSERT INTO hook_events (session_id, hook_kind, payload_json, decision, reason, latency_ms, created_at)
      VALUES (@sessionId, @hookKind, @payloadJson, @decision, @reason, @latencyMs, @createdAt)
    `).run({
      sessionId: h.sessionId, hookKind: h.hookKind, payloadJson: h.payloadJson,
      decision: h.decision ?? null, reason: h.reason ?? null,
      latencyMs: h.latencyMs ?? null, createdAt: h.createdAt,
    })
    return { ...h, id: Number(info.lastInsertRowid) }
  }
  latencyPercentiles(limit = 1000): { p50: number; p95: number; count: number } {
    const rows = this.db.prepare('SELECT latency_ms FROM hook_events WHERE latency_ms IS NOT NULL ORDER BY created_at DESC LIMIT ?').all(limit) as { latency_ms: number }[]
    if (!rows.length) return { p50: 0, p95: 0, count: 0 }
    const sorted = rows.map(r => r.latency_ms).sort((a, b) => a - b)
    return { p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], count: sorted.length }
  }
}

export interface GitEventRow {
  id?: number
  repo: string
  kind: string
  sha?: string | null
  prNumber?: number | null
  branch?: string | null
  createdAt: number
}

export class GitEventsRepo {
  constructor(private db: Database.Database) {}
  upsert(e: GitEventRow): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO git_events (repo, kind, sha, pr_number, branch, created_at)
      VALUES (@repo, @kind, @sha, @prNumber, @branch, @createdAt)
    `).run({ repo: e.repo, kind: e.kind, sha: e.sha ?? null, prNumber: e.prNumber ?? null, branch: e.branch ?? null, createdAt: e.createdAt })
  }
  findByRepo(repo: string): GitEventRow[] {
    return (this.db.prepare('SELECT * FROM git_events WHERE repo = ? ORDER BY created_at DESC').all(repo) as any[])
      .map(r => ({ id: r.id, repo: r.repo, kind: r.kind, sha: r.sha, prNumber: r.pr_number, branch: r.branch, createdAt: r.created_at }))
  }
  recentMerged(sinceMs: number): GitEventRow[] {
    return (this.db.prepare(`SELECT * FROM git_events WHERE kind = 'pr_merged' AND created_at >= ? ORDER BY created_at DESC`).all(sinceMs) as any[])
      .map(r => ({ id: r.id, repo: r.repo, kind: r.kind, sha: r.sha, prNumber: r.pr_number, branch: r.branch, createdAt: r.created_at }))
  }
}

export interface DetectionRow {
  id?: number
  sessionId: string | null
  ruleId: string
  severity: 'info' | 'warn' | 'block'
  summary: string
  metadataJson?: string | null
  suggestedActionJson?: string | null
  acknowledgedAt?: number | null
  createdAt: number
}

export class DetectionsRepo {
  constructor(private db: Database.Database) {}
  insert(d: DetectionRow): DetectionRow {
    const info = this.db.prepare(`
      INSERT INTO detections (session_id, rule_id, severity, summary, metadata_json, suggested_action_json, acknowledged_at, created_at)
      VALUES (@sessionId, @ruleId, @severity, @summary, @metadataJson, @suggestedActionJson, @acknowledgedAt, @createdAt)
    `).run({
      sessionId: d.sessionId, ruleId: d.ruleId, severity: d.severity, summary: d.summary,
      metadataJson: d.metadataJson ?? null, suggestedActionJson: d.suggestedActionJson ?? null,
      acknowledgedAt: d.acknowledgedAt ?? null, createdAt: d.createdAt,
    })
    return { ...d, id: Number(info.lastInsertRowid) }
  }
  recent(limit: number): DetectionRow[] {
    return (this.db.prepare('SELECT * FROM detections ORDER BY created_at DESC LIMIT ?').all(limit) as any[])
      .map(r => ({
        id: r.id, sessionId: r.session_id, ruleId: r.rule_id, severity: r.severity,
        summary: r.summary, metadataJson: r.metadata_json,
        suggestedActionJson: r.suggested_action_json, acknowledgedAt: r.acknowledged_at, createdAt: r.created_at,
      }))
  }
  acknowledge(id: number): void {
    this.db.prepare('UPDATE detections SET acknowledged_at = ? WHERE id = ?').run(Date.now(), id)
  }
}

export interface FeatureFlagRow {
  key: string
  enabled: number
  configJson?: string | null
}

export class FeatureFlagsRepo {
  constructor(private db: Database.Database) {}
  set(key: string, config: Record<string, unknown>): void {
    const enabled = config.enabled === false ? 0 : 1
    this.db.prepare(`
      INSERT INTO feature_flags (key, enabled, config_json) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, config_json = excluded.config_json
    `).run(key, enabled, JSON.stringify(config))
  }
  get(key: string): { enabled: number; config: Record<string, unknown> | null } | null {
    const row = this.db.prepare('SELECT enabled, config_json FROM feature_flags WHERE key = ?').get(key) as { enabled: number; config_json: string | null } | undefined
    if (!row) return null
    return { enabled: row.enabled, config: row.config_json ? JSON.parse(row.config_json) : null }
  }
  all(): Array<{ key: string; enabled: number; config: Record<string, unknown> | null }> {
    return (this.db.prepare('SELECT key, enabled, config_json FROM feature_flags ORDER BY key').all() as any[])
      .map(r => ({ key: r.key, enabled: r.enabled, config: r.config_json ? JSON.parse(r.config_json) : null }))
  }
}

export interface PrAttributionRow {
  prNumber: number
  repo: string
  sessionId: string
  overlapKind: 'branch_match' | 'commit_ancestor' | 'file_overlap'
  confidence: number
}

export class PrAttributionsRepo {
  constructor(private db: Database.Database) {}
  upsert(r: PrAttributionRow): void {
    this.db.prepare(`
      INSERT INTO pr_attributions (pr_number, repo, session_id, overlap_kind, confidence)
      VALUES (@prNumber, @repo, @sessionId, @overlapKind, @confidence)
      ON CONFLICT(pr_number, repo, session_id) DO UPDATE SET
        overlap_kind = excluded.overlap_kind, confidence = excluded.confidence
    `).run(r)
  }
  findByPr(repo: string, prNumber: number): PrAttributionRow[] {
    return (this.db.prepare('SELECT * FROM pr_attributions WHERE repo = ? AND pr_number = ?').all(repo, prNumber) as any[])
      .map(r => ({ prNumber: r.pr_number, repo: r.repo, sessionId: r.session_id, overlapKind: r.overlap_kind, confidence: r.confidence }))
  }
  totalCostCentsForPr(repo: string, prNumber: number): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(s.cost_millicents * pa.confidence), 0) as total
      FROM pr_attributions pa JOIN sessions s ON s.id = pa.session_id
      WHERE pa.repo = ? AND pa.pr_number = ?
    `).get(repo, prNumber) as { total: number }
    return Math.round(row.total / 10)
  }
}

export class BatchRunsRepo {
  constructor(private db: Database.Database) {}
  mark(jobName: string, status: string, at: number = Date.now()): void {
    this.db.prepare(`
      INSERT INTO batch_runs (job_name, last_run_at, last_status)
      VALUES (?, ?, ?)
      ON CONFLICT(job_name) DO UPDATE SET last_run_at = excluded.last_run_at, last_status = excluded.last_status
    `).run(jobName, at, status)
  }
  lastRunAt(jobName: string): number | null {
    const row = this.db.prepare('SELECT last_run_at FROM batch_runs WHERE job_name = ?').get(jobName) as { last_run_at: number } | undefined
    return row?.last_run_at ?? null
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/db/repository.test.ts
git add src/db/repository.ts test/db/repository.test.ts
git commit -m "feat(db): repositories for hook_events, git_events, detections, flags, pr_attributions, batch_runs"
```
Expected: 3 passing.

---

## Task 1.9: Retention purge

**Files:** create `cli/src/db/retention.ts`, test `cli/test/db/retention.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/db/retention.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../src/db/repository.js'
import { purge } from '../../src/db/retention.js'

const tmp = join(tmpdir(), `tokscale-retention-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('purge', () => {
  it('deletes messages older than retention_days, keeps sessions', () => {
    const db = getDb(tmp)
    const s = new SessionsRepo(db)
    const m = new MessagesRepo(db)
    const old = Date.now() - 100 * 24 * 60 * 60 * 1000
    const recent = Date.now()
    s.upsert({ id: 'sold', tool: 'claude_code', model: 'x', startedAt: old })
    s.upsert({ id: 'srec', tool: 'claude_code', model: 'x', startedAt: recent })
    m.insert({ sessionId: 'sold', turnIndex: 0, role: 'user', contentHash: 'h', createdAt: old })
    m.insert({ sessionId: 'srec', turnIndex: 0, role: 'user', contentHash: 'h', createdAt: recent })
    const result = purge(db, 90)
    expect(result.messages).toBe(1)
    expect((db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c).toBe(2)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/db/retention.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/db/retention.ts`:

```ts
import type Database from 'better-sqlite3'

export interface PurgeResult {
  messages: number
  toolCalls: number
  hookEvents: number
}

export function purge(db: Database.Database, retentionDays: number): PurgeResult {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const m = db.prepare('DELETE FROM messages WHERE created_at < ?').run(cutoff)
  const t = db.prepare('DELETE FROM tool_calls WHERE created_at < ?').run(cutoff)
  const h = db.prepare('DELETE FROM hook_events WHERE created_at < ?').run(cutoff)
  db.exec('VACUUM')
  return { messages: m.changes, toolCalls: t.changes, hookEvents: h.changes }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/db/retention.test.ts
git add src/db/retention.ts test/db/retention.test.ts
git commit -m "feat(db): retention purge for messages/tool_calls/hook_events"
```
Expected: 1 passing.

---

## Task 1.10: Redaction pipeline + builtins + repo

**Files:** create `cli/src/redaction/{builtins,pipeline,repository}.ts`, test `cli/test/redaction/{pipeline,builtins}.test.ts`

- [ ] **Step 1: Write failing pipeline test**

Write to `cli/test/redaction/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Redactor } from '../../src/redaction/pipeline.js'

describe('Redactor', () => {
  it('applies rules and returns redacted text', () => {
    const r = new Redactor([
      { id: 1, pattern: 'password=\\w+', replacement: 'password=[REDACTED]', enabled: 1, builtin: 1 },
    ])
    expect(r.apply('user=x password=abc123')).toBe('user=x password=[REDACTED]')
  })
  it('skips disabled rules', () => {
    const r = new Redactor([{ id: 1, pattern: 'x', replacement: 'Y', enabled: 0, builtin: 1 }])
    expect(r.apply('xxx')).toBe('xxx')
  })
  it('applies multiple rules in order', () => {
    const r = new Redactor([
      { id: 1, pattern: 'ghp_\\w+', replacement: '[GH_TOKEN]', enabled: 1, builtin: 1 },
      { id: 2, pattern: 'sk-\\w+', replacement: '[API_KEY]', enabled: 1, builtin: 1 },
    ])
    expect(r.apply('ghp_abc sk-xyz')).toBe('[GH_TOKEN] [API_KEY]')
  })
})
```

- [ ] **Step 2: Write failing builtins test**

Write to `cli/test/redaction/builtins.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BUILTIN_REDACTION_RULES } from '../../src/redaction/builtins.js'
import { Redactor } from '../../src/redaction/pipeline.js'

const r = new Redactor(BUILTIN_REDACTION_RULES.map((b, i) => ({ ...b, id: i + 1 })))

describe('builtin redaction rules', () => {
  it.each([
    ['AWS access key', 'AKIAIOSFODNN7EXAMPLE here', /\[REDACTED_AWS_AK\]/],
    ['GitHub token',   'ghp_abcdefghijklmnopqrstuvwxyz0123456789', /\[REDACTED_GH_TOKEN\]/],
    ['OpenAI key',     'sk-abcdefghijklmnopqrstuvwxyz', /\[REDACTED_API_KEY\]/],
    ['private key',    '-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n-----END OPENSSH PRIVATE KEY-----', /\[REDACTED_PRIVATE_KEY\]/],
    ['email',          'akhil@example.com', /\[REDACTED_EMAIL\]/],
  ])('redacts %s', (_name, input, match) => {
    expect(r.apply(input)).toMatch(match)
  })
})
```

- [ ] **Step 3: Run failing**

Run: `cd cli && npx vitest run test/redaction`
Expected: FAIL.

- [ ] **Step 4: Implement builtins**

Write to `cli/src/redaction/builtins.ts`:

```ts
export interface RedactionRuleDef {
  pattern: string
  replacement: string
  enabled: number
  builtin: number
}

export const BUILTIN_REDACTION_RULES: RedactionRuleDef[] = [
  { pattern: 'AKIA[0-9A-Z]{16}', replacement: '[REDACTED_AWS_AK]', enabled: 1, builtin: 1 },
  { pattern: 'ghp_[A-Za-z0-9]{20,}', replacement: '[REDACTED_GH_TOKEN]', enabled: 1, builtin: 1 },
  { pattern: 'github_pat_[A-Za-z0-9_]{20,}', replacement: '[REDACTED_GH_TOKEN]', enabled: 1, builtin: 1 },
  { pattern: 'sk-[A-Za-z0-9_-]{20,}', replacement: '[REDACTED_API_KEY]', enabled: 1, builtin: 1 },
  { pattern: 'xox[baprs]-[A-Za-z0-9-]{10,}', replacement: '[REDACTED_SLACK]', enabled: 1, builtin: 1 },
  { pattern: '-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----', replacement: '[REDACTED_PRIVATE_KEY]', enabled: 1, builtin: 1 },
  { pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', replacement: '[REDACTED_EMAIL]', enabled: 1, builtin: 1 },
  { pattern: '\\b\\+?\\d{1,2}[\\s.-]?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b', replacement: '[REDACTED_PHONE]', enabled: 1, builtin: 1 },
]
```

- [ ] **Step 5: Implement pipeline**

Write to `cli/src/redaction/pipeline.ts`:

```ts
export interface RedactionRule {
  id: number
  pattern: string
  replacement: string
  enabled: number
  builtin: number
}

export class Redactor {
  private compiled: Array<{ re: RegExp; replacement: string }>
  constructor(rules: RedactionRule[]) {
    this.compiled = rules
      .filter(r => r.enabled === 1)
      .map(r => ({ re: new RegExp(r.pattern, 'g'), replacement: r.replacement }))
  }
  apply(text: string): string {
    let out = text
    for (const { re, replacement } of this.compiled) out = out.replace(re, replacement)
    return out
  }
}
```

- [ ] **Step 6: Implement repository**

Write to `cli/src/redaction/repository.ts`:

```ts
import type Database from 'better-sqlite3'
import { BUILTIN_REDACTION_RULES } from './builtins.js'
import type { RedactionRule } from './pipeline.js'

export class RedactionRulesRepo {
  constructor(private db: Database.Database) {}
  seedBuiltins(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM redaction_rules WHERE builtin = 1').get() as { c: number }).c
    if (count > 0) return
    const stmt = this.db.prepare('INSERT INTO redaction_rules (pattern, replacement, enabled, builtin, created_at) VALUES (?, ?, ?, ?, ?)')
    const now = Date.now()
    for (const r of BUILTIN_REDACTION_RULES) stmt.run(r.pattern, r.replacement, r.enabled, r.builtin, now)
  }
  all(): RedactionRule[] {
    return this.db.prepare('SELECT id, pattern, replacement, enabled, builtin FROM redaction_rules ORDER BY id').all() as RedactionRule[]
  }
  add(pattern: string, replacement = '[REDACTED]'): RedactionRule {
    const info = this.db.prepare('INSERT INTO redaction_rules (pattern, replacement, enabled, builtin, created_at) VALUES (?, ?, 1, 0, ?)').run(pattern, replacement, Date.now())
    return { id: Number(info.lastInsertRowid), pattern, replacement, enabled: 1, builtin: 0 }
  }
  remove(id: number): void {
    this.db.prepare('DELETE FROM redaction_rules WHERE id = ? AND builtin = 0').run(id)
  }
  setEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE redaction_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }
}
```

- [ ] **Step 7: Verify + commit**

```bash
cd cli && npx vitest run test/redaction
git add src/redaction test/redaction
git commit -m "feat(redaction): pipeline + builtin rules + repo"
```
Expected: all pass.

---

## Task 1.11: bootDb integrator

**Files:** create `cli/src/db/boot.ts`, test `cli/test/db/boot.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/db/boot.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootDb } from '../../src/db/boot.js'
import { closeDb } from '../../src/db/connection.js'

const dir = join(tmpdir(), `tokscale-boot-${Date.now()}`)
const p = join(dir, 'toktracker.db')

afterEach(() => { closeDb(); try { rmSync(dir, { recursive: true }) } catch {} })

describe('bootDb', () => {
  it('migrates + seeds builtin redaction rules', () => {
    const db = bootDb(p)
    const rows = db.prepare('SELECT COUNT(*) as c FROM redaction_rules WHERE builtin = 1').get() as { c: number }
    expect(rows.c).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/db/boot.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/db/boot.ts`:

```ts
import type Database from 'better-sqlite3'
import { getDb } from './connection.js'
import { migrate } from './migrate.js'
import { RedactionRulesRepo } from '../redaction/repository.js'
import { dbPath, configDir } from './paths.js'

export function bootDb(overridePath?: string): Database.Database {
  const db = getDb(overridePath ?? dbPath())
  migrate(db, { legacyDir: configDir() })
  new RedactionRulesRepo(db).seedBuiltins()
  return db
}
```

- [ ] **Step 4: Verify + lint + commit**

```bash
cd cli && npx vitest run test/db/boot.test.ts && npm run lint
git add src/db/boot.ts test/db/boot.test.ts
git commit -m "feat(db): bootDb wires migrate + redaction seed"
```

---

## Phase 1 verification gate

- [ ] Run full suite: `cd cli && npm run test:run`
- [ ] Run lint: `cd cli && npm run lint`
- [ ] Both green → proceed to Part 2.
- [ ] Update `cli/HANDOVER.md`: add a "Storage (new)" section mentioning `src/db/`, `src/redaction/`, and the SQLite path. Commit with message `docs(cli): note new SQLite + redaction subsystems`.
