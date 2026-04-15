# Plan Part 6 — Phase 6: Category B + D Rules + Batch Scheduler

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: §6.2 (Category B), §6.4 (Category D), §6.5.

Depends on: Parts 1–5. Adds the cross-session rules (B6, B7, B8, B9), the PR-attribution worker (D13), the abandoned-session detector (D14), the embedding loader with hash-fallback, and a nightly scheduler.

---

## Task 6.1: Install embedding dependencies

**Files:** modify `cli/package.json`

- [ ] **Step 1: Install**

Run: `cd cli && npm install @xenova/transformers@^2.17.0`

These are heavy; the model itself downloads on first use into `~/.config/tokscale/models/`.

- [ ] **Step 2: Commit**

```bash
cd cli && git add package.json package-lock.json
git commit -m "chore(cli): add @xenova/transformers for local embeddings (B6)"
```

---

## Task 6.2: Embedding loader with lazy init + fallback

**Files:** create `cli/src/embeddings/loader.ts`, `cli/src/embeddings/similarity.ts`, `cli/src/embeddings/fallback.ts`, tests

- [ ] **Step 1: Write failing similarity test**

Write to `cli/test/embeddings/similarity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cosine } from '../../src/embeddings/similarity.js'

describe('cosine', () => {
  it('1 for identical vectors', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })
  it('0 for orthogonal', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })
  it('returns 0 for zero-length input', () => {
    expect(cosine([], [])).toBe(0)
  })
})
```

- [ ] **Step 2: Write failing fallback test**

Write to `cli/test/embeddings/fallback.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hashSimilarity } from '../../src/embeddings/fallback.js'

describe('hashSimilarity', () => {
  it('1.0 for identical strings', () => {
    expect(hashSimilarity('hello world', 'hello world')).toBeCloseTo(1, 5)
  })
  it('decreases with edit distance', () => {
    const a = hashSimilarity('hello world', 'hello world')
    const b = hashSimilarity('hello world', 'help world')
    expect(b).toBeLessThan(a)
  })
  it('zero for disjoint tokens', () => {
    expect(hashSimilarity('one two three', 'four five six')).toBeLessThan(0.1)
  })
})
```

- [ ] **Step 3: Run failing**

Run: `cd cli && npx vitest run test/embeddings`
Expected: FAIL.

- [ ] **Step 4: Implement similarity**

Write to `cli/src/embeddings/similarity.ts`:

```ts
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}
```

- [ ] **Step 5: Implement fallback**

Write to `cli/src/embeddings/fallback.ts`:

```ts
export function hashSimilarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 && tb.size === 0) return 1
  const union = new Set([...ta, ...tb])
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / union.size
}

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3),
  )
}
```

- [ ] **Step 6: Implement loader**

Write to `cli/src/embeddings/loader.ts`:

```ts
import { modelsDir } from '../db/paths.js'
import { cosine } from './similarity.js'
import { hashSimilarity } from './fallback.js'

let pipelinePromise: Promise<((text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>)> | null = null

export async function getEmbedder(): Promise<((text: string) => Promise<number[]>) | null> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      try {
        const { pipeline, env } = await import('@xenova/transformers')
        env.cacheDir = modelsDir()
        return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as any
      } catch {
        throw new Error('transformers unavailable')
      }
    })()
  }
  try {
    const pipe = await pipelinePromise
    return async (text: string) => {
      const out = await pipe(text, { pooling: 'mean', normalize: true })
      return Array.from(out.data)
    }
  } catch {
    return null
  }
}

export async function similarity(a: string, b: string): Promise<number> {
  const embed = await getEmbedder()
  if (!embed) return hashSimilarity(a, b)
  try {
    const [va, vb] = await Promise.all([embed(a), embed(b)])
    return cosine(va, vb)
  } catch {
    return hashSimilarity(a, b)
  }
}
```

- [ ] **Step 7: Verify + commit**

```bash
cd cli && npx vitest run test/embeddings
git add src/embeddings test/embeddings
git commit -m "feat(embeddings): cosine + fallback + lazy loader"
```
Expected: 6 passing (3 + 3).

---

## Task 6.3: Rule B6 — repeat question

**Files:** `cli/src/detection/rules/b6-repeat-question.ts`, test

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/b6.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b6RepeatQuestion } from '../../../src/detection/rules/b6-repeat-question.js'
import { sha256 } from '../../../src/capture/hashing.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b6-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B6 repeat question', () => {
  it('fires on 3+ identical content_hashes in last 90 days', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'past', tool: 'claude_code', model: 'm', startedAt: 1 })
    const m = new MessagesRepo(db)
    const hash = sha256('how does auth work')
    for (let i = 0; i < 3; i++) {
      m.insert({ sessionId: 'past', turnIndex: i, role: 'user', contentHash: hash, contentRedacted: 'how does auth work', createdAt: 1 + i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'UserPromptSubmit', sessionId: 'cur', userPrompt: 'how does auth work',
      timestamp: 100, thresholds: { min_matches: 3, window_days: 90 },
      hardBlockEnabled: false, now: () => 100,
    }
    const det = await b6RepeatQuestion.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('claude_md_edit')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/b6.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/b6-repeat-question.ts`:

```ts
import type { Rule } from '../types.js'
import { MessagesRepo } from '../../db/repository.js'
import { sha256 } from '../../capture/hashing.js'

export const b6RepeatQuestion: Rule = {
  id: 'B6_repeat_question',
  category: 'B',
  triggers: ['UserPromptSubmit', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_matches: 3, window_days: 90 },
  evaluate(ctx) {
    if (!ctx.userPrompt || ctx.userPrompt.length < 20) return null
    const hash = sha256(ctx.userPrompt)
    const since = ctx.now() - ctx.thresholds.window_days * 24 * 60 * 60 * 1000
    const count = new MessagesRepo(ctx.db).countByHashSince(hash, since)
    if (count < ctx.thresholds.min_matches) return null
    const sample = ctx.db.prepare(
      `SELECT content_redacted FROM messages WHERE content_hash = ? AND content_redacted IS NOT NULL LIMIT 1`
    ).get(hash) as { content_redacted: string } | undefined
    return {
      ruleId: 'B6_repeat_question',
      severity: 'info',
      summary: `you've asked this same question ${count}× in the last ${ctx.thresholds.window_days} days — add answer to CLAUDE.md?`,
      metadata: { count, hash },
      suggestedAction: {
        kind: 'claude_md_edit',
        payload: { question: sample?.content_redacted ?? '', hash },
      },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

Add to `src/detection/rules/index.ts`:

```ts
import { b6RepeatQuestion } from './b6-repeat-question.js'
// inside registerAllRules: registry.register(b6RepeatQuestion)
```

```bash
cd cli && npx vitest run test/detection/rules/b6.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): B6 repeat question detection"
```

---

## Task 6.4: Rule B7 — correction graph

**Files:** `cli/src/detection/rules/b7-correction-graph.ts`, test

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/b7.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b7CorrectionGraph } from '../../../src/detection/rules/b7-correction-graph.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b7-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B7 correction graph', () => {
  it('emits an info detection when the current user turn starts with a correction phrase', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    new MessagesRepo(db).insert({ sessionId: 'S', turnIndex: 0, role: 'user', contentHash: 'h', contentRedacted: "no don't use mocks, hit the real DB", createdAt: 10 })
    const ctx: DetectionContext = {
      db, trigger: 'Stop', sessionId: 'S', timestamp: 11,
      thresholds: {}, hardBlockEnabled: false, now: () => 11,
    }
    const det = await b7CorrectionGraph.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('claude_md_edit')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/b7.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/b7-correction-graph.ts`:

```ts
import type { Rule } from '../types.js'

const PATTERNS = [
  /\bno\s+(don'?t|do not)\b/i,
  /\bstop\s+(doing|using)\b/i,
  /\binstead\s+of\b/i,
  /\bactually\b/i,
  /\bthat'?s\s+wrong\b/i,
  /\bnever\s+(do|use)\b/i,
]

export const b7CorrectionGraph: Rule = {
  id: 'B7_correction_graph',
  category: 'B',
  triggers: ['Stop', 'PostToolUse'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: {},
  evaluate(ctx) {
    if (!ctx.sessionId) return null
    const row = ctx.db.prepare(`
      SELECT content_redacted FROM messages WHERE session_id = ? AND role = 'user'
      ORDER BY turn_index DESC LIMIT 1
    `).get(ctx.sessionId) as { content_redacted: string } | undefined
    if (!row?.content_redacted) return null
    if (!PATTERNS.some(p => p.test(row.content_redacted))) return null
    return {
      ruleId: 'B7_correction_graph',
      severity: 'info',
      summary: 'correction detected — candidate for CLAUDE.md rule',
      metadata: { text: row.content_redacted.slice(0, 200) },
      suggestedAction: { kind: 'claude_md_edit', payload: { text: row.content_redacted } },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/b7.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): B7 correction graph detection"
```

---

## Task 6.5: Rule B8 — file reopen tracker

**Files:** `cli/src/detection/rules/b8-file-reopen.ts`, test

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/b8.test.ts`:

```ts
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
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/b8.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/b8-file-reopen.ts`:

```ts
import type { Rule } from '../types.js'
import { ToolCallsRepo } from '../../db/repository.js'
import { extractTargetPath } from '../../capture/hashing.js'

export const b8FileReopen: Rule = {
  id: 'B8_file_reopen',
  category: 'B',
  triggers: ['PostToolUse'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_sessions: 5, window_days: 14 },
  evaluate(ctx) {
    if (!ctx.toolName || !ctx.toolInput) return null
    const path = extractTargetPath(ctx.toolName, ctx.toolInput)
    if (!path) return null
    const since = ctx.now() - ctx.thresholds.window_days * 24 * 60 * 60 * 1000
    const count = new ToolCallsRepo(ctx.db).countDistinctSessionsForPath(path, since)
    if (count < ctx.thresholds.min_sessions) return null
    return {
      ruleId: 'B8_file_reopen',
      severity: 'info',
      summary: `${path} has been opened in ${count} distinct sessions — consider adding to CLAUDE.md`,
      metadata: { path, sessions: count },
      suggestedAction: { kind: 'claude_md_edit', payload: { path, sessions: count } },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/b8.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): B8 file-reopen tracker"
```

---

## Task 6.6: Rule B9 — prompt pattern extractor

**Files:** `cli/src/detection/rules/b9-prompt-pattern.ts`, test

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/b9.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../../src/db/repository.js'
import { b9PromptPattern } from '../../../src/detection/rules/b9-prompt-pattern.js'
import { sha256 } from '../../../src/capture/hashing.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-b9-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('B9 prompt pattern extractor', () => {
  it('fires when a normalized prefix occurs in >= threshold prompts', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'm', startedAt: 1 })
    const m = new MessagesRepo(db)
    for (let i = 0; i < 6; i++) {
      const text = `review my PR #${i} and check for regressions against main`
      m.insert({ sessionId: 'S', turnIndex: i, role: 'user', contentHash: sha256(text), contentRedacted: text, createdAt: i })
    }
    const ctx: DetectionContext = {
      db, trigger: 'Nightly', sessionId: 'S', timestamp: 10,
      thresholds: { min_occurrences: 5, min_prefix_tokens: 5 },
      hardBlockEnabled: false, now: () => 10,
    }
    const det = await b9PromptPattern.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.suggestedAction?.kind).toBe('save_command')
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/b9.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/b9-prompt-pattern.ts`:

```ts
import type { Rule } from '../types.js'

export const b9PromptPattern: Rule = {
  id: 'B9_prompt_pattern',
  category: 'B',
  triggers: ['Stop', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_occurrences: 5, min_prefix_tokens: 5 },
  evaluate(ctx) {
    const rows = ctx.db.prepare(
      `SELECT content_redacted FROM messages WHERE role = 'user' AND content_redacted IS NOT NULL
       ORDER BY created_at DESC LIMIT 1000`
    ).all() as { content_redacted: string }[]
    const counts = new Map<string, number>()
    for (const r of rows) {
      const tokens = r.content_redacted.trim().split(/\s+/).slice(0, 12)
      if (tokens.length < ctx.thresholds.min_prefix_tokens) continue
      const prefix = tokens.slice(0, ctx.thresholds.min_prefix_tokens).join(' ').toLowerCase()
      counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
    }
    let best: { prefix: string; count: number } | null = null
    for (const [prefix, count] of counts) {
      if (count >= ctx.thresholds.min_occurrences && (!best || count > best.count)) best = { prefix, count }
    }
    if (!best) return null
    return {
      ruleId: 'B9_prompt_pattern',
      severity: 'info',
      summary: `pattern "${best.prefix}…" used ${best.count}× — save as slash command?`,
      metadata: { prefix: best.prefix, count: best.count },
      suggestedAction: { kind: 'save_command', payload: { prefix: best.prefix } },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/b9.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): B9 prompt pattern extractor"
```

---

## Task 6.7: PR correlator (D13 core)

**Files:** create `cli/src/git/pr-correlator.ts`, test `cli/test/git/pr-correlator.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/git/pr-correlator.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, GitEventsRepo, PrAttributionsRepo } from '../../src/db/repository.js'
import { correlatePrToSessions } from '../../src/git/pr-correlator.js'

const tmp = join(tmpdir(), `tokscale-prcorr-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('correlatePrToSessions', () => {
  it('attributes sessions on matching branch to the PR', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's1', tool: 'claude_code', model: 'm', startedAt: 1, gitRepo: 'a/b', gitBranch: 'feat/x' })
    new SessionsRepo(db).upsert({ id: 's2', tool: 'claude_code', model: 'm', startedAt: 2, gitRepo: 'a/b', gitBranch: 'main' })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 7, branch: 'feat/x', sha: 'abc', createdAt: 10 })
    correlatePrToSessions(db, 'a/b', 7)
    const attrs = new PrAttributionsRepo(db).findByPr('a/b', 7)
    expect(attrs.some(a => a.sessionId === 's1')).toBe(true)
    expect(attrs.some(a => a.sessionId === 's2')).toBe(false)
  })

  it('attributes via commit ancestry when branch differs', () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's3', tool: 'claude_code', model: 'm', startedAt: 1, gitRepo: 'a/b', gitBranch: 'other', gitCommitStart: 'abc', gitCommitEnd: 'abc' })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 9, branch: 'feat/y', sha: 'abc', createdAt: 10 })
    correlatePrToSessions(db, 'a/b', 9)
    const attrs = new PrAttributionsRepo(db).findByPr('a/b', 9)
    expect(attrs.some(a => a.sessionId === 's3' && a.overlapKind === 'commit_ancestor')).toBe(true)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/git/pr-correlator.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/git/pr-correlator.ts`:

```ts
import type Database from 'better-sqlite3'
import { PrAttributionsRepo } from '../db/repository.js'

interface PrRow { repo: string; pr_number: number; branch: string | null; sha: string | null; created_at: number }

export function correlatePrToSessions(db: Database.Database, repo: string, prNumber: number): void {
  const pr = db.prepare(`SELECT repo, pr_number, branch, sha, created_at FROM git_events WHERE repo = ? AND pr_number = ? AND kind = 'pr_merged'`).get(repo, prNumber) as PrRow | undefined
  if (!pr) return

  const attrRepo = new PrAttributionsRepo(db)

  if (pr.branch) {
    const branchRows = db.prepare(`SELECT id FROM sessions WHERE git_repo = ? AND git_branch = ?`).all(repo, pr.branch) as { id: string }[]
    for (const r of branchRows) {
      attrRepo.upsert({ repo, prNumber, sessionId: r.id, overlapKind: 'branch_match', confidence: 0.95 })
    }
  }

  if (pr.sha) {
    const shaRows = db.prepare(`SELECT id FROM sessions WHERE git_repo = ? AND (git_commit_start = ? OR git_commit_end = ?)`).all(repo, pr.sha, pr.sha) as { id: string }[]
    for (const r of shaRows) {
      attrRepo.upsert({ repo, prNumber, sessionId: r.id, overlapKind: 'commit_ancestor', confidence: 0.8 })
    }
  }
}
```

File-overlap attribution (third signal) is intentionally deferred: it requires tracking which files a session edited, which is not currently captured per-session. If added, emit rows with `overlap_kind='file_overlap'` and lower base confidence (~0.5).

- [ ] **Step 4: Verify + commit**

```bash
cd cli && npx vitest run test/git/pr-correlator.test.ts
git add src/git/pr-correlator.ts test/git/pr-correlator.test.ts
git commit -m "feat(git): PR↔session correlator (branch + commit ancestry)"
```
Expected: 2 passing.

---

## Task 6.8: Rule D13 — cost-per-PR wrapper

**Files:** `cli/src/detection/rules/d13-cost-per-pr.ts`, test

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/d13.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo, GitEventsRepo, PrAttributionsRepo } from '../../../src/db/repository.js'
import { d13CostPerPr } from '../../../src/detection/rules/d13-cost-per-pr.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-d13-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('D13 cost per PR', () => {
  it('summarises PR cost from attributions', async () => {
    const db = getDb(tmp)
    new SessionsRepo(db).upsert({ id: 's', tool: 'claude_code', model: 'm', startedAt: 1, gitRepo: 'a/b', costMillicents: 5000 })
    new GitEventsRepo(db).upsert({ repo: 'a/b', kind: 'pr_merged', prNumber: 42, branch: 'b', sha: null, createdAt: 10 })
    new PrAttributionsRepo(db).upsert({ repo: 'a/b', prNumber: 42, sessionId: 's', overlapKind: 'branch_match', confidence: 1 })
    const ctx: DetectionContext = {
      db, trigger: 'GitEvent', timestamp: 10,
      thresholds: {}, hardBlockEnabled: false, now: () => 10,
    }
    const det = await d13CostPerPr.evaluate({ ...ctx, sessionId: undefined })
    expect(det?.severity).toBe('info')
    expect((det?.metadata?.prNumber as number)).toBe(42)
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/d13.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/d13-cost-per-pr.ts`:

```ts
import type { Rule } from '../types.js'
import { PrAttributionsRepo } from '../../db/repository.js'

export const d13CostPerPr: Rule = {
  id: 'D13_cost_per_pr',
  category: 'D',
  triggers: ['GitEvent', 'Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_cents: 10 },
  evaluate(ctx) {
    const row = ctx.db.prepare(
      `SELECT repo, pr_number FROM git_events WHERE kind = 'pr_merged' ORDER BY created_at DESC LIMIT 1`
    ).get() as { repo: string; pr_number: number } | undefined
    if (!row) return null
    const attrs = new PrAttributionsRepo(ctx.db).findByPr(row.repo, row.pr_number)
    if (attrs.length === 0) return null
    const cents = new PrAttributionsRepo(ctx.db).totalCostCentsForPr(row.repo, row.pr_number)
    if (cents < ctx.thresholds.min_cents) return null
    return {
      ruleId: 'D13_cost_per_pr',
      severity: 'info',
      summary: `PR #${row.pr_number} in ${row.repo} = ~$${(cents / 100).toFixed(2)} across ${attrs.length} sessions`,
      metadata: { repo: row.repo, prNumber: row.pr_number, cents, sessions: attrs.length },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/d13.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): D13 cost per merged PR"
```

---

## Task 6.9: Rule D14 — abandoned-session waste

**Files:** `cli/src/detection/rules/d14-abandoned-session.ts`, test

- [ ] **Step 1: Write failing test**

Write to `cli/test/detection/rules/d14.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../../src/db/connection.js'
import { migrate } from '../../../src/db/migrate.js'
import { SessionsRepo } from '../../../src/db/repository.js'
import { d14AbandonedSession } from '../../../src/detection/rules/d14-abandoned-session.js'
import type { DetectionContext } from '../../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-d14-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('D14 abandoned session', () => {
  it('flags sessions old enough without commits or PRs', async () => {
    const db = getDb(tmp)
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000
    new SessionsRepo(db).upsert({ id: 'old', tool: 'claude_code', model: 'm', startedAt: old, gitRepo: 'a/b', gitBranch: 'feat/orphan', costMillicents: 50_000 })
    const ctx: DetectionContext = {
      db, trigger: 'Nightly', timestamp: Date.now(),
      thresholds: { min_age_days: 7, min_cents: 1 }, hardBlockEnabled: false, now: () => Date.now(),
    }
    const det = await d14AbandonedSession.evaluate(ctx)
    expect(det?.severity).toBe('info')
    expect(det?.metadata?.sessionIds).toBeDefined()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/detection/rules/d14.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Write to `cli/src/detection/rules/d14-abandoned-session.ts`:

```ts
import type { Rule } from '../types.js'

export const d14AbandonedSession: Rule = {
  id: 'D14_abandoned_session',
  category: 'D',
  triggers: ['Nightly'],
  defaultSeverity: 'info',
  hardBlockEligible: false,
  defaultThresholds: { min_age_days: 7, min_cents: 25 },
  evaluate(ctx) {
    const cutoff = ctx.now() - ctx.thresholds.min_age_days * 24 * 60 * 60 * 1000
    const rows = ctx.db.prepare(`
      SELECT s.id, s.cost_millicents FROM sessions s
      LEFT JOIN pr_attributions pa ON pa.session_id = s.id
      LEFT JOIN git_events g ON g.repo = s.git_repo AND g.branch = s.git_branch AND g.kind IN ('commit','pr_merged','pr_opened')
      WHERE s.started_at < ? AND pa.session_id IS NULL AND g.id IS NULL
    `).all(cutoff) as Array<{ id: string; cost_millicents: number }>
    const qualifying = rows.filter(r => r.cost_millicents >= ctx.thresholds.min_cents * 10)
    if (qualifying.length === 0) return null
    const totalCents = Math.round(qualifying.reduce((s, r) => s + r.cost_millicents, 0) / 10)
    return {
      ruleId: 'D14_abandoned_session',
      severity: 'info',
      summary: `${qualifying.length} likely-abandoned sessions totalling ~$${(totalCents / 100).toFixed(2)}`,
      metadata: { sessionIds: qualifying.map(r => r.id), totalCents },
    }
  },
}
```

- [ ] **Step 4: Register + commit**

```bash
cd cli && npx vitest run test/detection/rules/d14.test.ts
git add src/detection/rules test/detection/rules
git commit -m "feat(rules): D14 abandoned session waste"
```

---

## Task 6.10: Update registerAllRules with all B + D rules

**Files:** modify `cli/src/detection/rules/index.ts`

- [ ] **Step 1: Overwrite index**

Write to `cli/src/detection/rules/index.ts`:

```ts
import type { RuleRegistry } from '../registry.js'
import { a1RedundantToolCall } from './a1-redundant-tool-call.js'
import { a2ContextBloat } from './a2-context-bloat.js'
import { a3CacheMissPostmortem } from './a3-cache-miss-postmortem.js'
import { a4ModelMismatch } from './a4-model-mismatch.js'
import { a5RetryFailureWaste } from './a5-retry-failure-waste.js'
import { b6RepeatQuestion } from './b6-repeat-question.js'
import { b7CorrectionGraph } from './b7-correction-graph.js'
import { b8FileReopen } from './b8-file-reopen.js'
import { b9PromptPattern } from './b9-prompt-pattern.js'
import { c10ContextWindowEta } from './c10-context-window-eta.js'
import { c11PreflightCost } from './c11-preflight-cost.js'
import { c12RunawayKillswitch } from './c12-runaway-killswitch.js'
import { d13CostPerPr } from './d13-cost-per-pr.js'
import { d14AbandonedSession } from './d14-abandoned-session.js'

export function registerAllRules(registry: RuleRegistry): void {
  registry.register(a1RedundantToolCall)
  registry.register(a2ContextBloat)
  registry.register(a3CacheMissPostmortem)
  registry.register(a4ModelMismatch)
  registry.register(a5RetryFailureWaste)
  registry.register(b6RepeatQuestion)
  registry.register(b7CorrectionGraph)
  registry.register(b8FileReopen)
  registry.register(b9PromptPattern)
  registry.register(c10ContextWindowEta)
  registry.register(c11PreflightCost)
  registry.register(c12RunawayKillswitch)
  registry.register(d13CostPerPr)
  registry.register(d14AbandonedSession)
}
```

- [ ] **Step 2: Verify + commit**

```bash
cd cli && npm run test:run && npm run lint
git add src/detection/rules/index.ts
git commit -m "feat(rules): register all 14 rules (A+B+C+D)"
```

---

## Task 6.11: Nightly scheduler — embedded cron

**Files:** create `cli/src/scheduler/jobs.ts`, `cli/src/scheduler/cron.ts`, test `cli/test/scheduler/jobs.test.ts`

- [ ] **Step 1: Write failing test**

Write to `cli/test/scheduler/jobs.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { BatchRunsRepo } from '../../src/db/repository.js'
import { runNightlyJobs } from '../../src/scheduler/jobs.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { registerAllRules } from '../../src/detection/rules/index.js'

const tmp = join(tmpdir(), `tokscale-jobs-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('runNightlyJobs', () => {
  it('marks all nightly jobs in batch_runs', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); registerAllRules(reg)
    await runNightlyJobs(db, reg)
    const repo = new BatchRunsRepo(db)
    expect(repo.lastRunAt('b6_clustering')).toBeTruthy()
    expect(repo.lastRunAt('b9_pattern_mining')).toBeTruthy()
    expect(repo.lastRunAt('d14_abandoned')).toBeTruthy()
    expect(repo.lastRunAt('vacuum')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run failing**

Run: `cd cli && npx vitest run test/scheduler/jobs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement jobs**

Write to `cli/src/scheduler/jobs.ts`:

```ts
import type Database from 'better-sqlite3'
import { BatchRunsRepo } from '../db/repository.js'
import { DetectionsRepo } from '../db/repository.js'
import { purge } from '../db/retention.js'
import type { RuleRegistry } from '../detection/registry.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import { DetectionRunner } from '../detection/runner.js'

export async function runNightlyJobs(db: Database.Database, registry: RuleRegistry, retentionDays = 90): Promise<void> {
  const runs = new BatchRunsRepo(db)
  const runner = new DetectionRunner(db, registry, new ThresholdLoader(db), { budgetMs: 10_000 })
  const ctxBase = {
    db, trigger: 'Nightly' as const, timestamp: Date.now(),
    thresholds: {}, hardBlockEnabled: false, now: () => Date.now(),
  }

  try { await runner.run(ctxBase); runs.mark('b6_clustering', 'ok') } catch { runs.mark('b6_clustering', 'error') }
  try { await runner.run(ctxBase); runs.mark('b7_correction_clustering', 'ok') } catch { runs.mark('b7_correction_clustering', 'error') }
  try { await runner.run(ctxBase); runs.mark('b9_pattern_mining', 'ok') } catch { runs.mark('b9_pattern_mining', 'error') }
  try { await runner.run(ctxBase); runs.mark('d14_abandoned', 'ok') } catch { runs.mark('d14_abandoned', 'error') }

  try { purge(db, retentionDays); runs.mark('vacuum', 'ok') } catch { runs.mark('vacuum', 'error') }

  // prune acknowledged detections older than retention
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  db.prepare('DELETE FROM detections WHERE acknowledged_at IS NOT NULL AND created_at < ?').run(cutoff)
}
```

- [ ] **Step 4: Implement cron helper**

Write to `cli/src/scheduler/cron.ts`:

```ts
import type Database from 'better-sqlite3'
import type { RuleRegistry } from '../detection/registry.js'
import { BatchRunsRepo } from '../db/repository.js'
import { runNightlyJobs } from './jobs.js'

const ONE_DAY = 24 * 60 * 60 * 1000

export async function maybeRunNightly(db: Database.Database, registry: RuleRegistry): Promise<boolean> {
  const last = new BatchRunsRepo(db).lastRunAt('nightly_anchor') ?? 0
  if (Date.now() - last < ONE_DAY) return false
  await runNightlyJobs(db, registry)
  new BatchRunsRepo(db).mark('nightly_anchor', 'ok')
  return true
}
```

- [ ] **Step 5: Verify + commit**

```bash
cd cli && npx vitest run test/scheduler/jobs.test.ts
git add src/scheduler test/scheduler
git commit -m "feat(scheduler): nightly batch jobs + daily cron anchor"
```
Expected: 1 passing.

---

## Phase 6 verification gate

- [ ] Full test suite green: `cd cli && npm run test:run`
- [ ] Lint green: `cd cli && npm run lint`
- [ ] All 14 rules registered; nightly runner exercises them.
- [ ] Proceed to Part 7 (TUI + daemon + polish).
- [ ] Update `cli/HANDOVER.md` section "Rules + batch (new)" listing all rule files + scheduler. Commit.
