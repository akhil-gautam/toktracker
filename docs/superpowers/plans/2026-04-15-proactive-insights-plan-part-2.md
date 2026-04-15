# Plan Part 2 — Phase 2: Data Capture Upgrade

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: `docs/superpowers/specs/2026-04-15-proactive-insights-design.md`

Depends on: Part 1 (storage foundation). Tasks here extend existing parsers to populate `messages` + `tool_calls`, add a git event worker, and ship a backfill job.

---

## Task 2.1: Parser contract extension — emit messages + tool_calls

**Files:** modify `cli/src/types.ts`

- [ ] **Step 1: Read current types**

Read `cli/src/types.ts` (already shown in parent planning thread). Existing `Parser.parse` returns `ParseResult { sessions, newOffset }`.

- [ ] **Step 2: Extend types**

Append to `cli/src/types.ts`:

```ts
export interface ParsedMessage {
  sessionId: string
  turnIndex: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string              // raw text, will be redacted before persist
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
  createdAt: Date
}

export interface ParsedToolCall {
  sessionId: string
  turnIndex: number            // the assistant turn that invoked the tool
  toolName: string
  argsRaw: unknown             // will be JSON.stringify'd then redacted + hashed
  targetPath?: string          // extracted when tool is Read/Write/Edit/Grep etc.
  succeeded?: boolean
  tokensReturned?: number
  createdAt: Date
}

export interface ExtendedParseResult extends ParseResult {
  messages: ParsedMessage[]
  toolCalls: ParsedToolCall[]
}
```

Leave the existing `ParseResult` in place for backwards compatibility; `ExtendedParseResult` is what parsers will return going forward.

- [ ] **Step 3: Verify lint**

Run: `cd cli && npm run lint`
Expected: clean (no existing code is broken — existing callers still consume the plain fields).

- [ ] **Step 4: Commit**

```bash
cd cli && git add src/types.ts
git commit -m "feat(types): ExtendedParseResult with ParsedMessage + ParsedToolCall"
```

---

## Task 2.2: Hashing + arg normalization helpers

**Files:** create `cli/src/capture/hashing.ts`, test `cli/test/capture/hashing.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/capture/hashing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sha256, normalizeArgs, extractTargetPath } from '../../src/capture/hashing.js'

describe('sha256', () => {
  it('is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'))
  })
  it('differs on different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'))
  })
})

describe('normalizeArgs', () => {
  it('sorts keys and produces canonical JSON', () => {
    expect(normalizeArgs({ b: 2, a: 1 })).toBe(normalizeArgs({ a: 1, b: 2 }))
  })
  it('handles nested objects', () => {
    expect(normalizeArgs({ x: { z: 2, y: 1 } })).toBe(normalizeArgs({ x: { y: 1, z: 2 } }))
  })
})

describe('extractTargetPath', () => {
  it('returns file_path when present', () => {
    expect(extractTargetPath('Read', { file_path: '/x/y.ts' })).toBe('/x/y.ts')
  })
  it('returns path for Write', () => {
    expect(extractTargetPath('Write', { path: '/a' })).toBe('/a')
  })
  it('returns null when absent', () => {
    expect(extractTargetPath('Bash', { command: 'ls' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/capture/hashing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/capture/hashing.ts`:

```ts
import { createHash } from 'node:crypto'

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function normalizeArgs(args: unknown): string {
  return JSON.stringify(sortKeys(args))
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}

const TARGET_KEYS: Record<string, string[]> = {
  Read: ['file_path', 'path'],
  Write: ['file_path', 'path'],
  Edit: ['file_path', 'path'],
  Grep: ['path'],
  Glob: ['path'],
  NotebookEdit: ['notebook_path'],
}

export function extractTargetPath(toolName: string, args: unknown): string | null {
  const keys = TARGET_KEYS[toolName] ?? ['file_path', 'path']
  if (!args || typeof args !== 'object') return null
  const obj = args as Record<string, unknown>
  for (const k of keys) {
    if (typeof obj[k] === 'string') return obj[k] as string
  }
  return null
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/capture/hashing.test.ts
git add src/capture/hashing.ts test/capture/hashing.test.ts
git commit -m "feat(capture): sha256 + normalizeArgs + extractTargetPath helpers"
```
Expected: all pass.

---

## Task 2.3: MessageRecorder — persist messages + tool_calls with redaction

**Files:** create `cli/src/capture/message-recorder.ts`, test `cli/test/capture/message-recorder.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/capture/message-recorder.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo, ToolCallsRepo } from '../../src/db/repository.js'
import { RedactionRulesRepo } from '../../src/redaction/repository.js'
import { MessageRecorder } from '../../src/capture/message-recorder.js'

const tmp = join(tmpdir(), `tokscale-recorder-${Date.now()}.db`)
beforeEach(() => { const db = getDb(tmp); migrate(db); new RedactionRulesRepo(db).seedBuiltins() })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('MessageRecorder', () => {
  it('records a message with redacted content + hash', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's1', tool: 'claude_code', model: 'm', startedAt: 1 })
    const r = new MessageRecorder(db)
    const result = r.recordMessage({
      sessionId: 's1', turnIndex: 0, role: 'user',
      content: 'please use my ghp_abcdefghijklmnopqrstuvwxyz0123456789 token',
      createdAt: new Date(2),
    })
    expect(result.contentHash).toHaveLength(64)
    const rows = new MessagesRepo(db).findBySession('s1')
    expect(rows[0].contentRedacted).toContain('[REDACTED_GH_TOKEN]')
  })

  it('records tool call with hashed normalized args', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's2', tool: 'claude_code', model: 'm', startedAt: 1 })
    const r = new MessageRecorder(db)
    const msg = r.recordMessage({ sessionId: 's2', turnIndex: 0, role: 'assistant', content: 'using tool', createdAt: new Date(2) })
    const tc = r.recordToolCall({
      messageId: msg.id, sessionId: 's2', turnIndex: 0,
      toolName: 'Read', argsRaw: { file_path: '/x.ts', other: 1 }, createdAt: new Date(3),
    })
    expect(tc.argsHash).toHaveLength(64)
    const dup = r.recordToolCall({
      messageId: msg.id, sessionId: 's2', turnIndex: 0,
      toolName: 'Read', argsRaw: { other: 1, file_path: '/x.ts' }, createdAt: new Date(4),
    })
    expect(dup.argsHash).toBe(tc.argsHash)
    expect(new ToolCallsRepo(db).findBySessionToolArgs('s2', 'Read', tc.argsHash).length).toBe(2)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/capture/message-recorder.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/capture/message-recorder.ts`:

```ts
import type Database from 'better-sqlite3'
import { MessagesRepo, ToolCallsRepo } from '../db/repository.js'
import { RedactionRulesRepo } from '../redaction/repository.js'
import { Redactor } from '../redaction/pipeline.js'
import { sha256, normalizeArgs, extractTargetPath } from './hashing.js'

export interface RecordMessageInput {
  sessionId: string
  turnIndex: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
  createdAt: Date
}

export interface RecordMessageResult {
  id: number
  contentHash: string
}

export interface RecordToolCallInput {
  messageId: number
  sessionId: string
  turnIndex: number
  toolName: string
  argsRaw: unknown
  succeeded?: boolean
  tokensReturned?: number
  createdAt: Date
}

export interface RecordToolCallResult {
  id: number
  argsHash: string
}

export class MessageRecorder {
  private redactor: Redactor
  private messages: MessagesRepo
  private toolCalls: ToolCallsRepo

  constructor(db: Database.Database) {
    this.redactor = new Redactor(new RedactionRulesRepo(db).all())
    this.messages = new MessagesRepo(db)
    this.toolCalls = new ToolCallsRepo(db)
  }

  recordMessage(input: RecordMessageInput): RecordMessageResult {
    const redacted = this.redactor.apply(input.content)
    const hash = sha256(redacted)
    const row = this.messages.insert({
      sessionId: input.sessionId, turnIndex: input.turnIndex, role: input.role,
      contentHash: hash, contentRedacted: redacted,
      inputTokens: input.inputTokens, outputTokens: input.outputTokens,
      cacheRead: input.cacheRead, cacheWrite: input.cacheWrite, thinkingTokens: input.thinkingTokens,
      createdAt: input.createdAt.getTime(),
    })
    return { id: row.id!, contentHash: hash }
  }

  recordToolCall(input: RecordToolCallInput): RecordToolCallResult {
    const normalized = normalizeArgs(input.argsRaw)
    const redacted = this.redactor.apply(normalized)
    const hash = sha256(redacted)
    const row = this.toolCalls.insert({
      messageId: input.messageId, sessionId: input.sessionId,
      toolName: input.toolName, argsHash: hash, argsJson: redacted,
      targetPath: extractTargetPath(input.toolName, input.argsRaw),
      succeeded: input.succeeded == null ? null : (input.succeeded ? 1 : 0),
      tokensReturned: input.tokensReturned ?? 0,
      createdAt: input.createdAt.getTime(),
    })
    return { id: row.id!, argsHash: hash }
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/capture/message-recorder.test.ts
git add src/capture/message-recorder.ts test/capture/message-recorder.test.ts
git commit -m "feat(capture): MessageRecorder persists with redaction + hashes"
```
Expected: 2 passing.

---

## Task 2.4: Extend claude-code parser to emit ExtendedParseResult

**Files:** modify `cli/src/parsers/claude-code.ts`, `cli/test/claude-code-parser.test.ts`

- [ ] **Step 1: Read current parser**

Run: `cd cli && cat src/parsers/claude-code.ts | head -60`

- [ ] **Step 2: Append failing test to existing test file**

Append to `cli/test/claude-code-parser.test.ts`:

```ts
import { parseClaudeCodeExtended } from '../src/parsers/claude-code.js'
import { join } from 'node:path'

describe('claude-code ExtendedParseResult', () => {
  it('emits messages + tool calls for a fixture JSONL', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'claude-code', 'basic.jsonl')
    const result = await parseClaudeCodeExtended(fixture, 0)
    expect(result.sessions.length).toBeGreaterThan(0)
    expect(result.messages.length).toBeGreaterThan(0)
    const toolUses = result.toolCalls.filter(t => t.toolName === 'Read')
    if (toolUses.length > 0) {
      expect(toolUses[0].targetPath).toBeTruthy()
    }
  })
})
```

- [ ] **Step 3: Implement `parseClaudeCodeExtended`**

Add a new exported function to `cli/src/parsers/claude-code.ts` without breaking the existing `parse` function. The approach is:

1. Re-use the existing JSONL-line iteration logic.
2. For each assistant message with a `usage` block, emit a `ParsedMessage` (role='assistant', content=concatenation of text blocks).
3. For each user turn in the transcript, emit a `ParsedMessage` (role='user').
4. For each `tool_use` entry in the assistant message content, emit a `ParsedToolCall`.
5. `turnIndex` increments per top-level user↔assistant exchange.

Append to `cli/src/parsers/claude-code.ts`:

```ts
import { readFile } from 'node:fs/promises'
import type { ExtendedParseResult, ParsedMessage, ParsedToolCall, Session } from '../types.js'

export async function parseClaudeCodeExtended(filePath: string, fromOffset: number): Promise<ExtendedParseResult> {
  const raw = await readFile(filePath, 'utf8')
  const bytes = Buffer.byteLength(raw, 'utf8')
  const slice = fromOffset > 0 ? raw.slice(fromOffset) : raw
  const lines = slice.split('\n').filter(l => l.trim().length > 0)

  const sessions: Session[] = []
  const messages: ParsedMessage[] = []
  const toolCalls: ParsedToolCall[] = []

  let currentSessionId: string | null = null
  let turnIndex = 0

  for (const line of lines) {
    if (!line.includes('"type"')) continue
    let obj: any
    try { obj = JSON.parse(line) } catch { continue }

    if (obj.sessionId && obj.sessionId !== currentSessionId) {
      currentSessionId = obj.sessionId
      turnIndex = 0
    }
    if (!currentSessionId) continue

    if (obj.type === 'user' && obj.message?.content) {
      messages.push({
        sessionId: currentSessionId,
        turnIndex,
        role: 'user',
        content: extractText(obj.message.content),
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
    }
    if (obj.type === 'assistant' && obj.message?.content) {
      const content = obj.message.content
      messages.push({
        sessionId: currentSessionId,
        turnIndex,
        role: 'assistant',
        content: extractText(content),
        inputTokens: obj.message?.usage?.input_tokens,
        outputTokens: obj.message?.usage?.output_tokens,
        cacheRead: obj.message?.usage?.cache_read_input_tokens,
        cacheWrite: obj.message?.usage?.cache_creation_input_tokens,
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
      for (const block of Array.isArray(content) ? content : []) {
        if (block?.type === 'tool_use') {
          toolCalls.push({
            sessionId: currentSessionId,
            turnIndex,
            toolName: block.name,
            argsRaw: block.input,
            createdAt: new Date(obj.timestamp ?? Date.now()),
          })
        }
      }
      turnIndex += 1
    }
  }

  // Derive sessions from existing parser to preserve shape
  const base = await parse(filePath, fromOffset)
  sessions.push(...base.sessions)

  return { sessions, newOffset: bytes, messages, toolCalls }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => (typeof b === 'string' ? b : b?.text ?? '')).join('\n')
  }
  return ''
}
```

If the existing parser exports `parse` under a different name, adapt accordingly (check the top of the file). If there's no `parse`, replace `await parse(...)` with direct re-use of the logic already in the file.

- [ ] **Step 4: Run test**

Run: `cd cli && npx vitest run test/claude-code-parser.test.ts`
Expected: all original + new tests pass.

- [ ] **Step 5: Commit**

```bash
cd cli && git add src/parsers/claude-code.ts test/claude-code-parser.test.ts
git commit -m "feat(parsers): claude-code emits ExtendedParseResult with messages + tool calls"
```

---

## Task 2.5: Extend codex parser

**Files:** modify `cli/src/parsers/codex.ts`, `cli/test/codex-parser.test.ts`

- [ ] **Step 1: Read existing parser structure**

Run: `cd cli && cat src/parsers/codex.ts | head -80`

- [ ] **Step 2: Append failing test**

Append to `cli/test/codex-parser.test.ts`:

```ts
import { parseCodexExtended } from '../src/parsers/codex.js'
import { join } from 'node:path'

describe('codex ExtendedParseResult', () => {
  it('emits messages for a fixture session', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'codex', 'basic.jsonl')
    const result = await parseCodexExtended(fixture, 0)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Implement `parseCodexExtended`**

Append to `cli/src/parsers/codex.ts`:

```ts
import { readFile } from 'node:fs/promises'
import type { ExtendedParseResult, ParsedMessage, ParsedToolCall, Session } from '../types.js'

export async function parseCodexExtended(filePath: string, fromOffset: number): Promise<ExtendedParseResult> {
  const raw = await readFile(filePath, 'utf8')
  const bytes = Buffer.byteLength(raw, 'utf8')
  const slice = fromOffset > 0 ? raw.slice(fromOffset) : raw

  const sessions: Session[] = []
  const messages: ParsedMessage[] = []
  const toolCalls: ParsedToolCall[] = []
  let currentSessionId: string | null = null
  let turnIndex = 0

  for (const line of slice.split('\n').filter(l => l.trim())) {
    let obj: any
    try { obj = JSON.parse(line) } catch { continue }
    const kind = obj.type ?? obj.event ?? obj.kind
    if (kind === 'session_meta' && obj.session_id) {
      currentSessionId = obj.session_id
      turnIndex = 0
    }
    if (!currentSessionId) continue
    if (kind === 'event_msg' || kind === 'message') {
      const role = obj.role ?? (obj.sender === 'user' ? 'user' : 'assistant')
      messages.push({
        sessionId: currentSessionId,
        turnIndex,
        role: role === 'user' ? 'user' : 'assistant',
        content: String(obj.content ?? obj.text ?? ''),
        inputTokens: obj.usage?.input_tokens,
        outputTokens: obj.usage?.output_tokens,
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
      if (role !== 'user') turnIndex += 1
    }
    if (kind === 'tool_call' && obj.tool_name) {
      toolCalls.push({
        sessionId: currentSessionId,
        turnIndex,
        toolName: obj.tool_name,
        argsRaw: obj.arguments ?? obj.input ?? {},
        succeeded: obj.status === 'success',
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
    }
  }

  const base = await parse(filePath, fromOffset)
  sessions.push(...base.sessions)
  return { sessions, newOffset: bytes, messages, toolCalls }
}
```

(Same caveat as 2.4: if the existing export is not named `parse`, adapt.)

- [ ] **Step 4: Run test + commit**

```bash
cd cli && npx vitest run test/codex-parser.test.ts
git add src/parsers/codex.ts test/codex-parser.test.ts
git commit -m "feat(parsers): codex emits ExtendedParseResult"
```

---

## Task 2.6: Extend opencode parser

**Files:** modify `cli/src/parsers/opencode.ts`, `cli/test/opencode-parser.test.ts`

- [ ] **Step 1: Read existing implementation**

Run: `cd cli && cat src/parsers/opencode.ts | head -80`

- [ ] **Step 2: Append failing test**

Append to `cli/test/opencode-parser.test.ts`:

```ts
import { parseOpencodeExtended } from '../src/parsers/opencode.js'
import { join } from 'node:path'

describe('opencode ExtendedParseResult', () => {
  it('reads messages + tool calls from SQLite fixture', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'opencode', 'opencode.db')
    const result = await parseOpencodeExtended(fixture, 0)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
```

If no SQLite fixture exists yet, create one by running the opencode tool once in a throwaway cwd and copying its `opencode.db` to `cli/src/parsers/__fixtures__/opencode/opencode.db`.

- [ ] **Step 3: Implement `parseOpencodeExtended`**

Append to `cli/src/parsers/opencode.ts`:

```ts
import Database from 'better-sqlite3'
import type { ExtendedParseResult, ParsedMessage, ParsedToolCall, Session } from '../types.js'

export async function parseOpencodeExtended(dbFile: string, sinceMs: number): Promise<ExtendedParseResult> {
  const db = new Database(dbFile, { readonly: true, fileMustExist: true })
  try {
    const sessions: Session[] = []
    const messages: ParsedMessage[] = []
    const toolCalls: ParsedToolCall[] = []

    const msgRows = db.prepare(`SELECT * FROM messages WHERE created_at >= ? ORDER BY created_at`).all(sinceMs) as any[]
    for (const r of msgRows) {
      messages.push({
        sessionId: r.session_id,
        turnIndex: r.turn_index ?? 0,
        role: (r.role === 'user' ? 'user' : 'assistant'),
        content: r.content ?? '',
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        createdAt: new Date(r.created_at),
      })
    }
    const tcRows = db.prepare(`SELECT * FROM tool_calls WHERE created_at >= ? ORDER BY created_at`).all(sinceMs) as any[]
    for (const r of tcRows) {
      toolCalls.push({
        sessionId: r.session_id,
        turnIndex: r.turn_index ?? 0,
        toolName: r.tool_name,
        argsRaw: r.args ? JSON.parse(r.args) : {},
        succeeded: !!r.succeeded,
        createdAt: new Date(r.created_at),
      })
    }

    const base = await parse(dbFile, sinceMs)
    sessions.push(...base.sessions)
    return { sessions, newOffset: Date.now(), messages, toolCalls }
  } finally {
    db.close()
  }
}
```

If OpenCode's real schema doesn't have `messages`/`tool_calls`/`turn_index`, adapt the queries to whatever tables/columns exist in the fixture. Inspect with `cd cli && node -e "const d = require('better-sqlite3')('src/parsers/__fixtures__/opencode/opencode.db',{readonly:true}); console.log(d.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all())"` and adjust.

- [ ] **Step 4: Run test + commit**

```bash
cd cli && npx vitest run test/opencode-parser.test.ts
git add src/parsers/opencode.ts test/opencode-parser.test.ts
git commit -m "feat(parsers): opencode emits ExtendedParseResult"
```

---

## Task 2.7: Extend gemini-cli parser

**Files:** modify `cli/src/parsers/gemini-cli.ts`, `cli/test/gemini-parser.test.ts`

- [ ] **Step 1: Read existing parser**

Run: `cd cli && cat src/parsers/gemini-cli.ts | head -60`

- [ ] **Step 2: Append failing test**

Append to `cli/test/gemini-parser.test.ts`:

```ts
import { parseGeminiExtended } from '../src/parsers/gemini-cli.js'
import { join } from 'node:path'

describe('gemini ExtendedParseResult', () => {
  it('emits messages for a fixture chat JSON', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'gemini', 'basic.json')
    const result = await parseGeminiExtended(fixture, 0)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Implement**

Append to `cli/src/parsers/gemini-cli.ts`:

```ts
import { readFile } from 'node:fs/promises'
import type { ExtendedParseResult, ParsedMessage, ParsedToolCall, Session } from '../types.js'

export async function parseGeminiExtended(filePath: string, fromOffset: number): Promise<ExtendedParseResult> {
  const raw = await readFile(filePath, 'utf8')
  const bytes = Buffer.byteLength(raw, 'utf8')
  const obj = JSON.parse(raw)

  const sessions: Session[] = []
  const messages: ParsedMessage[] = []
  const toolCalls: ParsedToolCall[] = []

  const sessionId = obj.session_id ?? filePath
  const turns = Array.isArray(obj.messages ?? obj.turns) ? (obj.messages ?? obj.turns) : []
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]
    messages.push({
      sessionId,
      turnIndex: i,
      role: t.role === 'user' ? 'user' : 'assistant',
      content: String(t.content ?? t.text ?? ''),
      createdAt: new Date(t.timestamp ?? Date.now()),
    })
  }

  const base = await parse(filePath, fromOffset)
  sessions.push(...base.sessions)
  return { sessions, newOffset: bytes, messages, toolCalls }
}
```

- [ ] **Step 4: Run test + commit**

```bash
cd cli && npx vitest run test/gemini-parser.test.ts
git add src/parsers/gemini-cli.ts test/gemini-parser.test.ts
git commit -m "feat(parsers): gemini-cli emits ExtendedParseResult"
```

---

## Task 2.8: Parser registry returns ExtendedParseResult

**Files:** modify `cli/src/parsers/index.ts`, test to be added in Task 2.9

- [ ] **Step 1: Read current registry**

Run: `cd cli && cat src/parsers/index.ts`

- [ ] **Step 2: Add extended entry points**

Append to `cli/src/parsers/index.ts`:

```ts
import { parseClaudeCodeExtended } from './claude-code.js'
import { parseCodexExtended } from './codex.js'
import { parseOpencodeExtended } from './opencode.js'
import { parseGeminiExtended } from './gemini-cli.js'
import type { ExtendedParseResult, Tool } from '../types.js'

export async function parseFileExtended(tool: Tool, path: string, fromOffset: number): Promise<ExtendedParseResult> {
  switch (tool) {
    case 'claude_code': return parseClaudeCodeExtended(path, fromOffset)
    case 'codex':       return parseCodexExtended(path, fromOffset)
    case 'opencode':    return parseOpencodeExtended(path, fromOffset)
    case 'gemini_cli':  return parseGeminiExtended(path, fromOffset)
  }
}
```

- [ ] **Step 3: Lint + commit**

```bash
cd cli && npm run lint
git add src/parsers/index.ts
git commit -m "feat(parsers): parseFileExtended dispatcher"
```

---

## Task 2.9: Backfill command — one-time history import

**Files:** create `cli/src/capture/backfill.ts`, test `cli/test/capture/backfill.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/capture/backfill.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../src/db/repository.js'
import { RedactionRulesRepo } from '../../src/redaction/repository.js'
import { backfill } from '../../src/capture/backfill.js'

const tmp = join(tmpdir(), `tokscale-backfill-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
const dbPath = join(tmp, 'db.sqlite')

beforeEach(() => { const db = getDb(dbPath); migrate(db); new RedactionRulesRepo(db).seedBuiltins() })
afterEach(() => { closeDb(); try { rmSync(tmp, { recursive: true }) } catch {} })

describe('backfill', () => {
  it('imports sessions + messages from a claude_code fixture dir', async () => {
    const fixture = join(tmp, 'claude', 'session.jsonl')
    mkdirSync(join(tmp, 'claude'), { recursive: true })
    const payload = [
      { type: 'user', sessionId: 'sess-A', timestamp: '2026-04-01T00:00:00Z', message: { content: 'hello' } },
      { type: 'assistant', sessionId: 'sess-A', timestamp: '2026-04-01T00:00:05Z', message: { content: 'hi', usage: { input_tokens: 10, output_tokens: 5 } } },
    ].map(o => JSON.stringify(o)).join('\n')
    writeFileSync(fixture, payload)

    const db = getDb(dbPath)
    new SessionsRepo(db).upsert({ id: 'sess-A', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: Date.parse('2026-04-01T00:00:00Z') })

    const result = await backfill(db, 'claude_code', fixture)
    expect(result.messagesInserted).toBeGreaterThanOrEqual(2)
    expect(new MessagesRepo(db).findBySession('sess-A').length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/capture/backfill.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/capture/backfill.ts`:

```ts
import type Database from 'better-sqlite3'
import type { Tool } from '../types.js'
import { parseFileExtended } from '../parsers/index.js'
import { MessageRecorder } from './message-recorder.js'

export interface BackfillResult {
  messagesInserted: number
  toolCallsInserted: number
}

export async function backfill(db: Database.Database, tool: Tool, path: string): Promise<BackfillResult> {
  const { messages, toolCalls } = await parseFileExtended(tool, path, 0)
  const recorder = new MessageRecorder(db)
  let msgCount = 0
  let tcCount = 0
  const msgIdByKey = new Map<string, number>()

  const tx = db.transaction(() => {
    for (const m of messages) {
      const key = `${m.sessionId}:${m.turnIndex}:${m.role}`
      const res = recorder.recordMessage({
        sessionId: m.sessionId, turnIndex: m.turnIndex, role: m.role, content: m.content,
        inputTokens: m.inputTokens, outputTokens: m.outputTokens,
        cacheRead: m.cacheRead, cacheWrite: m.cacheWrite,
        thinkingTokens: m.thinkingTokens, createdAt: m.createdAt,
      })
      msgIdByKey.set(key, res.id)
      msgCount += 1
    }
    for (const tc of toolCalls) {
      const key = `${tc.sessionId}:${tc.turnIndex}:assistant`
      const messageId = msgIdByKey.get(key)
      if (!messageId) continue
      recorder.recordToolCall({
        messageId,
        sessionId: tc.sessionId,
        turnIndex: tc.turnIndex,
        toolName: tc.toolName,
        argsRaw: tc.argsRaw,
        succeeded: tc.succeeded,
        tokensReturned: tc.tokensReturned,
        createdAt: tc.createdAt,
      })
      tcCount += 1
    }
  })
  tx()
  return { messagesInserted: msgCount, toolCallsInserted: tcCount }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/capture/backfill.test.ts
git add src/capture test/capture
git commit -m "feat(capture): backfill ingests history into messages + tool_calls"
```
Expected: all pass.

---

## Task 2.10: Git event worker

**Files:** create `cli/src/git/event-worker.ts`, test `cli/test/git/event-worker.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/git/event-worker.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { GitEventsRepo } from '../../src/db/repository.js'
import { GitEventWorker } from '../../src/git/event-worker.js'

const tmp = join(tmpdir(), `tokscale-git-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('GitEventWorker', () => {
  it('dedupes merged PRs on repeated poll', async () => {
    const db = getDb(tmp)
    const runner = vi.fn().mockResolvedValue([
      { number: 12, mergedAt: '2026-04-01T00:00:00Z', headRefName: 'feat/x', mergeCommit: { oid: 'abc123' } },
    ])
    const w = new GitEventWorker(db, { ghRun: runner })
    await w.pollRepo('a/b')
    await w.pollRepo('a/b')
    expect(new GitEventsRepo(db).findByRepo('a/b').length).toBe(1)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/git/event-worker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/git/event-worker.ts`:

```ts
import type Database from 'better-sqlite3'
import { spawn } from 'node:child_process'
import { GitEventsRepo } from '../db/repository.js'

export interface GhPr {
  number: number
  mergedAt: string | null
  headRefName?: string
  mergeCommit?: { oid?: string }
}

export interface GitEventWorkerDeps {
  ghRun?: (repo: string) => Promise<GhPr[]>
}

async function defaultGhRun(repo: string): Promise<GhPr[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['pr', 'list', '--repo', repo, '--state', 'merged', '--json', 'number,mergedAt,headRefName,mergeCommit', '--limit', '100'])
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`gh exited ${code}: ${err}`))
      try { resolve(JSON.parse(out)) } catch (e) { reject(e as Error) }
    })
  })
}

export class GitEventWorker {
  private repo: GitEventsRepo
  private ghRun: (repo: string) => Promise<GhPr[]>

  constructor(db: Database.Database, deps: GitEventWorkerDeps = {}) {
    this.repo = new GitEventsRepo(db)
    this.ghRun = deps.ghRun ?? defaultGhRun
  }

  async pollRepo(repo: string): Promise<void> {
    let prs: GhPr[]
    try { prs = await this.ghRun(repo) } catch { return }
    for (const p of prs) {
      if (!p.mergedAt) continue
      this.repo.upsert({
        repo, kind: 'pr_merged', prNumber: p.number,
        branch: p.headRefName ?? null,
        sha: p.mergeCommit?.oid ?? null,
        createdAt: Date.parse(p.mergedAt),
      })
    }
  }
}
```

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/git/event-worker.test.ts
git add src/git/event-worker.ts test/git/event-worker.test.ts
git commit -m "feat(git): event worker polls gh for merged PRs (dedup-safe)"
```
Expected: 1 passing.

---

## Task 2.11: Git commit event harvester — populate commits from `git log`

**Files:** modify `cli/src/git/event-worker.ts`, `cli/test/git/event-worker.test.ts`

- [ ] **Step 1: Append failing test**

Append to `cli/test/git/event-worker.test.ts`:

```ts
describe('pollCommits', () => {
  it('stores commits from a git log function', async () => {
    const db = getDb(tmp)
    const runner = vi.fn().mockResolvedValue([
      { sha: 'a1', authoredAt: '2026-04-01T00:00:00Z', branch: 'main' },
      { sha: 'a2', authoredAt: '2026-04-01T01:00:00Z', branch: 'main' },
    ])
    const w = new GitEventWorker(db, { ghRun: async () => [], gitLogRun: runner })
    await w.pollCommits('a/b', '/tmp/repo')
    expect(new GitEventsRepo(db).findByRepo('a/b').filter(e => e.kind === 'commit').length).toBe(2)
  })
})
```

- [ ] **Step 2: Add `pollCommits` + dep**

Modify `cli/src/git/event-worker.ts`:

```ts
export interface GitCommitEntry {
  sha: string
  authoredAt: string
  branch?: string
}

export interface GitEventWorkerDeps {
  ghRun?: (repo: string) => Promise<GhPr[]>
  gitLogRun?: (repo: string, cwd: string) => Promise<GitCommitEntry[]>
}

async function defaultGitLogRun(_repo: string, cwd: string): Promise<GitCommitEntry[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', cwd, 'log', '--pretty=format:%H|%aI', '-n', '500'])
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err))
      resolve(out.split('\n').filter(Boolean).map(l => {
        const [sha, authoredAt] = l.split('|')
        return { sha, authoredAt }
      }))
    })
  })
}
```

Then add a method on `GitEventWorker`:

```ts
  async pollCommits(repo: string, cwd: string): Promise<void> {
    let commits: GitCommitEntry[]
    try { commits = await (this.deps.gitLogRun ?? defaultGitLogRun)(repo, cwd) } catch { return }
    for (const c of commits) {
      this.repo.upsert({
        repo, kind: 'commit', sha: c.sha, branch: c.branch ?? null,
        prNumber: null, createdAt: Date.parse(c.authoredAt),
      })
    }
  }
```

Update the constructor to retain `deps` on the instance (add `private deps: GitEventWorkerDeps = {}` field and assign in constructor).

- [ ] **Step 3: Verify + commit**

```bash
cd cli && npx vitest run test/git/event-worker.test.ts
git add src/git/event-worker.ts test/git/event-worker.test.ts
git commit -m "feat(git): pollCommits harvests commits from git log"
```

---

## Phase 2 verification gate

- [ ] Run full suite: `cd cli && npm run test:run`
- [ ] Run lint: `cd cli && npm run lint`
- [ ] Both green → proceed to Part 3.
- [ ] Update `cli/HANDOVER.md`: add section "Data capture (new)" noting `src/capture/`, `src/git/`, extended parser entry points. Commit.
