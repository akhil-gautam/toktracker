# tokscale CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Ink TUI that parses Claude Code, Codex, OpenCode, and Gemini CLI session files, calculates costs, and displays a colorful animated dashboard with `/` command navigation.

**Architecture:** Four tool-specific parsers feed a unified Session type into an in-memory session store. The store aggregates by day/model/tool/repo. Ink components render the dashboard with gradient text, animated progress bars, and color-coded cost displays. Local state (cursors, budgets) persists to `~/.config/tokscale/`. Server features are gated behind `auth.json` existence (not built in this plan).

**Tech Stack:** TypeScript, Ink 5 (React 18), tsup, vitest, chokidar, better-sqlite3, chalk 5, ink-gradient, ink-big-text, ink-spinner

---

## File Structure

```
cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── bin/
│   └── tokscale.js
├── src/
│   ├── index.tsx
│   ├── app.tsx
│   ├── types.ts
│   ├── theme.ts
│   ├── parsers/
│   │   ├── index.ts
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── opencode.ts
│   │   ├── gemini-cli.ts
│   │   └── __fixtures__/
│   │       ├── claude-code.jsonl
│   │       ├── codex.jsonl
│   │       ├── opencode-seed.sql
│   │       └── gemini-session.json
│   ├── services/
│   │   ├── cost-calculator.ts
│   │   ├── git-attribution.ts
│   │   ├── state-manager.ts
│   │   └── session-store.ts
│   ├── hooks/
│   │   ├── useAnimatedValue.ts
│   │   ├── useSessions.ts
│   │   └── useBudget.ts
│   ├── components/
│   │   ├── Header.tsx
│   │   ├── Loading.tsx
│   │   ├── Dashboard.tsx
│   │   ├── ModelBreakdown.tsx
│   │   ├── ToolBreakdown.tsx
│   │   ├── WeekChart.tsx
│   │   ├── BudgetBar.tsx
│   │   ├── SessionList.tsx
│   │   ├── RepoView.tsx
│   │   ├── TimelineView.tsx
│   │   ├── ModelView.tsx
│   │   ├── BudgetView.tsx
│   │   ├── CommandInput.tsx
│   │   └── HelpView.tsx
│   ├── views/
│   │   └── index.ts
│   └── data/
│       └── pricing.json
└── test/
    ├── cost-calculator.test.ts
    ├── claude-code-parser.test.ts
    ├── codex-parser.test.ts
    ├── opencode-parser.test.ts
    ├── gemini-parser.test.ts
    ├── git-attribution.test.ts
    ├── state-manager.test.ts
    ├── session-store.test.ts
    └── budget.test.ts
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/tsup.config.ts`
- Create: `cli/vitest.config.ts`
- Create: `cli/bin/tokscale.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "tokscale",
  "version": "0.1.0",
  "description": "AI coding tool spend tracker",
  "type": "module",
  "bin": {
    "tokscale": "./bin/tokscale.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "ink": "^5.2.0",
    "ink-big-text": "^2.0.0",
    "ink-gradient": "^3.0.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.3.1",
    "chalk": "^5.4.0",
    "chokidar": "^4.0.0",
    "better-sqlite3": "^11.8.0",
    "glob": "^11.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.7.0",
    "tsup": "^8.4.0",
    "vitest": "^3.0.0",
    "ink-testing-library": "^4.0.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
})
```

Note: The banner is needed because `better-sqlite3` is a native addon that requires `require()`.

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: Create bin/tokscale.js**

```javascript
#!/usr/bin/env node
import('../dist/index.js')
```

- [ ] **Step 6: Install dependencies**

Run: `cd cli && npm install`
Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 7: Verify build works**

Create a minimal `src/index.tsx`:

```tsx
console.log('tokscale')
```

Run: `cd cli && npx tsup`
Expected: `dist/index.js` created.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(cli): scaffold project with Ink 5, TypeScript, tsup, vitest"
```

---

## Task 2: Core Types + Pricing Data

**Files:**
- Create: `cli/src/types.ts`
- Create: `cli/src/data/pricing.json`
- Create: `cli/src/theme.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export type Tool = 'claude_code' | 'codex' | 'opencode' | 'gemini_cli'

export interface Session {
  id: string
  tool: Tool
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  costMillicents: number
  cwd?: string
  gitRepo?: string
  gitBranch?: string
  startedAt: Date
  endedAt?: Date
  estimated?: boolean  // true when tokens are estimated (e.g. Gemini)
}

export interface ParseResult {
  sessions: Session[]
  newOffset: number
}

export interface Parser {
  name: string
  tool: Tool
  globPattern: string
  parse(filePath: string, fromOffset: number): Promise<ParseResult>
}

export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion: number
  cacheWritePerMillion: number
}

export interface PricingMap {
  [model: string]: ModelPricing
}

export interface Budget {
  id: string
  scope: 'global' | 'project' | 'repo'
  scopeValue?: string
  period: 'daily' | 'weekly' | 'monthly'
  limitCents: number
  alertAtPct: number
}

export interface CursorState {
  cursors: Record<string, number>  // filePath -> byte offset (or timestamp for SQLite)
  lastSync?: string
}

export interface DayStats {
  date: string  // YYYY-MM-DD
  costMillicents: number
  inputTokens: number
  outputTokens: number
  sessionCount: number
}

export interface ModelStats {
  model: string
  costMillicents: number
  inputTokens: number
  outputTokens: number
  sessionCount: number
}

export interface ToolStats {
  tool: Tool
  costMillicents: number
  sessionCount: number
}

export interface RepoStats {
  repo: string
  costMillicents: number
  sessionCount: number
  models: string[]
}
```

- [ ] **Step 2: Create pricing.json**

Prices in USD per 1 million tokens. Source: public API pricing pages as of April 2026.

```json
{
  "claude-opus-4-6": {
    "inputPerMillion": 15.0,
    "outputPerMillion": 75.0,
    "cacheReadPerMillion": 1.5,
    "cacheWritePerMillion": 18.75
  },
  "claude-sonnet-4-6": {
    "inputPerMillion": 3.0,
    "outputPerMillion": 15.0,
    "cacheReadPerMillion": 0.3,
    "cacheWritePerMillion": 3.75
  },
  "claude-sonnet-4-5-20250929": {
    "inputPerMillion": 3.0,
    "outputPerMillion": 15.0,
    "cacheReadPerMillion": 0.3,
    "cacheWritePerMillion": 3.75
  },
  "claude-haiku-4-5-20251001": {
    "inputPerMillion": 0.8,
    "outputPerMillion": 4.0,
    "cacheReadPerMillion": 0.08,
    "cacheWritePerMillion": 1.0
  },
  "gpt-4.1": {
    "inputPerMillion": 2.0,
    "outputPerMillion": 8.0,
    "cacheReadPerMillion": 0.5,
    "cacheWritePerMillion": 2.0
  },
  "gpt-4.1-mini": {
    "inputPerMillion": 0.4,
    "outputPerMillion": 1.6,
    "cacheReadPerMillion": 0.1,
    "cacheWritePerMillion": 0.4
  },
  "gpt-4.1-nano": {
    "inputPerMillion": 0.1,
    "outputPerMillion": 0.4,
    "cacheReadPerMillion": 0.025,
    "cacheWritePerMillion": 0.1
  },
  "gpt-5.4": {
    "inputPerMillion": 2.0,
    "outputPerMillion": 8.0,
    "cacheReadPerMillion": 0.5,
    "cacheWritePerMillion": 2.0
  },
  "gpt-5.3-codex": {
    "inputPerMillion": 2.0,
    "outputPerMillion": 8.0,
    "cacheReadPerMillion": 0.5,
    "cacheWritePerMillion": 2.0
  },
  "o3": {
    "inputPerMillion": 2.0,
    "outputPerMillion": 8.0,
    "cacheReadPerMillion": 0.5,
    "cacheWritePerMillion": 2.0
  },
  "o4-mini": {
    "inputPerMillion": 1.1,
    "outputPerMillion": 4.4,
    "cacheReadPerMillion": 0.275,
    "cacheWritePerMillion": 1.1
  },
  "gemini-2.5-pro": {
    "inputPerMillion": 1.25,
    "outputPerMillion": 10.0,
    "cacheReadPerMillion": 0.315,
    "cacheWritePerMillion": 1.25
  },
  "gemini-2.5-flash": {
    "inputPerMillion": 0.15,
    "outputPerMillion": 0.6,
    "cacheReadPerMillion": 0.0375,
    "cacheWritePerMillion": 0.15
  },
  "google/gemini-3.1-pro-preview": {
    "inputPerMillion": 1.25,
    "outputPerMillion": 10.0,
    "cacheReadPerMillion": 0.315,
    "cacheWritePerMillion": 1.25
  }
}
```

- [ ] **Step 3: Create theme.ts**

```typescript
import chalk from 'chalk'

// Model color palette - visually distinct, works on dark and light terminals
export const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-6': '#E8A838',
  'claude-sonnet-4-6': '#7C6FE0',
  'claude-sonnet-4-5-20250929': '#9B8FEA',
  'claude-haiku-4-5-20251001': '#5CB8B2',
  'gpt-4.1': '#4CAF50',
  'gpt-4.1-mini': '#81C784',
  'gpt-4.1-nano': '#A5D6A7',
  'gpt-5.4': '#2196F3',
  'gpt-5.3-codex': '#42A5F5',
  'o3': '#FF7043',
  'o4-mini': '#FF8A65',
  'gemini-2.5-pro': '#EC407A',
  'gemini-2.5-flash': '#F48FB1',
  'google/gemini-3.1-pro-preview': '#EC407A',
}

export const TOOL_COLORS: Record<string, string> = {
  claude_code: '#E8A838',
  codex: '#4CAF50',
  opencode: '#2196F3',
  gemini_cli: '#EC407A',
}

export const TOOL_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini_cli: 'Gemini CLI',
}

export function budgetColor(pct: number): string {
  if (pct < 50) return '#4CAF50'
  if (pct < 80) return '#FFC107'
  return '#F44336'
}

export function costColor(amount: number, dailyAvg: number): string {
  if (dailyAvg === 0) return '#4CAF50'
  const ratio = amount / dailyAvg
  if (ratio < 0.8) return '#4CAF50'
  if (ratio < 1.2) return '#FFC107'
  return '#F44336'
}

export const HEADER_GRADIENT = ['#36D1DC', '#5B86E5']

export const BAR_FULL = '\u2588'
export const BAR_EMPTY = '\u2591'
export const BAR_HALF = '\u2593'

export function formatCost(millicents: number): string {
  const dollars = millicents / 100_000
  if (dollars >= 100) return `$${dollars.toFixed(0)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return `${tokens}`
}

export function getModelColor(model: string): string {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model]
  let hash = 0
  for (let i = 0; i < model.length; i++) {
    hash = model.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 60%)`
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd cli && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/data/pricing.json src/theme.ts
git commit -m "feat(cli): add core types, model pricing data, and color theme"
```

---

## Task 3: Cost Calculator

**Files:**
- Create: `cli/src/services/cost-calculator.ts`
- Create: `cli/test/cost-calculator.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/cost-calculator.test.ts
import { describe, it, expect } from 'vitest'
import { calculateCost, calculateCostMillicents } from '../src/services/cost-calculator.js'

describe('calculateCostMillicents', () => {
  it('calculates cost for claude-opus-4-6', () => {
    const cost = calculateCostMillicents({
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 100,
    })
    // input: 1000 * 15.0 / 1M = 0.015 USD = 1500 millicents
    // output: 500 * 75.0 / 1M = 0.0375 USD = 3750 millicents
    // cache read: 2000 * 1.5 / 1M = 0.003 USD = 300 millicents
    // cache write: 100 * 18.75 / 1M = 0.001875 USD = 187.5 millicents
    // total = 5737.5 -> rounded to 5738
    expect(cost).toBe(5738)
  })

  it('calculates cost for gpt-4.1', () => {
    const cost = calculateCostMillicents({
      model: 'gpt-4.1',
      inputTokens: 10000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    // input: 10000 * 2.0 / 1M = 0.02 USD = 2000 millicents
    // output: 1000 * 8.0 / 1M = 0.008 USD = 800 millicents
    // total = 2800
    expect(cost).toBe(2800)
  })

  it('returns 0 for unknown model with zero tokens', () => {
    const cost = calculateCostMillicents({
      model: 'unknown-model',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(cost).toBe(0)
  })

  it('uses zero pricing for unknown model', () => {
    const cost = calculateCostMillicents({
      model: 'some-future-model',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(cost).toBe(0)
  })
})

describe('calculateCost (dollars)', () => {
  it('converts millicents to dollars', () => {
    const dollars = calculateCost({
      model: 'claude-opus-4-6',
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    // 1M input tokens * $15/M = $15.00
    expect(dollars).toBeCloseTo(15.0, 2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/cost-calculator.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement cost-calculator.ts**

```typescript
// src/services/cost-calculator.ts
import pricingData from '../data/pricing.json' with { type: 'json' }
import type { PricingMap } from '../types.js'

const pricing: PricingMap = pricingData

interface CostInput {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

const ZERO_PRICING = {
  inputPerMillion: 0,
  outputPerMillion: 0,
  cacheReadPerMillion: 0,
  cacheWritePerMillion: 0,
}

function lookupPricing(model: string) {
  if (pricing[model]) return pricing[model]

  for (const key of Object.keys(pricing)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return pricing[key]
    }
  }

  return ZERO_PRICING
}

/**
 * Calculate cost in millicents (1/1000 of a cent).
 * 100,000 millicents = $1.00
 */
export function calculateCostMillicents(input: CostInput): number {
  const p = lookupPricing(input.model)

  const cost =
    (input.inputTokens * p.inputPerMillion +
      input.outputTokens * p.outputPerMillion +
      input.cacheReadTokens * p.cacheReadPerMillion +
      input.cacheWriteTokens * p.cacheWritePerMillion) /
    1_000_000

  // Convert USD to millicents: $1 = 100 cents = 100,000 millicents
  return Math.round(cost * 100_000)
}

/**
 * Calculate cost in USD dollars.
 */
export function calculateCost(input: CostInput): number {
  return calculateCostMillicents(input) / 100_000
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/cost-calculator.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/cost-calculator.ts test/cost-calculator.test.ts
git commit -m "feat(cli): add cost calculator with model pricing lookup"
```

---

## Task 4: Claude Code Parser

**Files:**
- Create: `cli/src/parsers/__fixtures__/claude-code.jsonl`
- Create: `cli/src/parsers/claude-code.ts`
- Create: `cli/test/claude-code-parser.test.ts`

- [ ] **Step 1: Create test fixture**

Create `cli/src/parsers/__fixtures__/claude-code.jsonl` with these lines (one JSON object per line):

Line 1: `{"parentUuid":null,"sessionId":"sess-001","type":"user","cwd":"/Users/dev/my-project","gitBranch":"main","message":{"role":"user","content":"Hello"},"uuid":"msg-001","timestamp":"2026-04-13T08:00:00.000Z"}`

Line 2: `{"parentUuid":"msg-001","sessionId":"sess-001","type":"assistant","cwd":"/Users/dev/my-project","gitBranch":"main","message":{"model":"claude-sonnet-4-6","role":"assistant","content":[{"type":"text","text":"Hi there"}],"usage":{"input_tokens":100,"cache_creation_input_tokens":50,"cache_read_input_tokens":200,"output_tokens":30}},"uuid":"msg-002","timestamp":"2026-04-13T08:00:05.000Z"}`

Line 3: `{"parentUuid":"msg-002","sessionId":"sess-001","type":"user","cwd":"/Users/dev/my-project","gitBranch":"main","message":{"role":"user","content":"Fix the bug"},"uuid":"msg-003","timestamp":"2026-04-13T08:01:00.000Z"}`

Line 4: `{"parentUuid":"msg-003","sessionId":"sess-001","type":"assistant","cwd":"/Users/dev/my-project","gitBranch":"main","message":{"model":"claude-sonnet-4-6","role":"assistant","content":[{"type":"text","text":"Done"}],"usage":{"input_tokens":500,"cache_creation_input_tokens":0,"cache_read_input_tokens":800,"output_tokens":200}},"uuid":"msg-004","timestamp":"2026-04-13T08:01:10.000Z"}`

Line 5: `{"parentUuid":null,"sessionId":"sess-002","type":"user","cwd":"/Users/dev/other-project","gitBranch":"feat/new","message":{"role":"user","content":"Explain this"},"uuid":"msg-005","timestamp":"2026-04-13T09:00:00.000Z"}`

Line 6: `{"parentUuid":"msg-005","sessionId":"sess-002","type":"assistant","cwd":"/Users/dev/other-project","gitBranch":"feat/new","message":{"model":"claude-opus-4-6","role":"assistant","content":[{"type":"text","text":"Sure"}],"usage":{"input_tokens":2000,"cache_creation_input_tokens":100,"cache_read_input_tokens":5000,"output_tokens":800}},"uuid":"msg-006","timestamp":"2026-04-13T09:00:15.000Z"}`

- [ ] **Step 2: Write the failing tests**

```typescript
// test/claude-code-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseClaudeCode } from '../src/parsers/claude-code.js'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'claude-code.jsonl')

describe('Claude Code parser', () => {
  it('parses assistant messages with token usage', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    expect(result.sessions.length).toBe(3) // 3 assistant messages
  })

  it('extracts correct token counts from first assistant message', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.inputTokens).toBe(100)
    expect(first.outputTokens).toBe(30)
    expect(first.cacheReadTokens).toBe(200)
    expect(first.cacheWriteTokens).toBe(50)
    expect(first.model).toBe('claude-sonnet-4-6')
    expect(first.tool).toBe('claude_code')
  })

  it('extracts cwd and git branch', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.cwd).toBe('/Users/dev/my-project')
    expect(first.gitBranch).toBe('main')
  })

  it('extracts different session from second conversation', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const third = result.sessions[2]
    expect(third.model).toBe('claude-opus-4-6')
    expect(third.cwd).toBe('/Users/dev/other-project')
    expect(third.gitBranch).toBe('feat/new')
    expect(third.inputTokens).toBe(2000)
  })

  it('calculates cost in millicents', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.costMillicents).toBeGreaterThan(0)
  })

  it('returns newOffset for incremental reads', async () => {
    const first = await parseClaudeCode(fixturePath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseClaudeCode(fixturePath, first.newOffset)
    expect(second.sessions.length).toBe(0) // no new data
  })

  it('sets timestamps correctly', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.startedAt).toEqual(new Date('2026-04-13T08:00:05.000Z'))
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/claude-code-parser.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 4: Implement claude-code.ts**

```typescript
// src/parsers/claude-code.ts
import { readFile, stat } from 'fs/promises'
import { createHash } from 'crypto'
import type { Session, ParseResult } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

interface ClaudeCodeLine {
  parentUuid?: string | null
  sessionId?: string
  type: string
  cwd?: string
  gitBranch?: string
  message?: {
    model?: string
    role?: string
    usage?: {
      input_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
      output_tokens?: number
    }
  }
  uuid?: string
  timestamp?: string
}

export async function parseClaudeCode(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) {
    return { sessions: [], newOffset: fromOffset }
  }

  const buffer = await readFile(filePath)
  const content = buffer.subarray(fromOffset).toString('utf-8')
  const lines = content.split('\n').filter(line => line.trim().length > 0)

  const sessions: Session[] = []

  for (const line of lines) {
    let parsed: ClaudeCodeLine
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (parsed.type !== 'assistant' || !parsed.message?.usage) continue

    const usage = parsed.message.usage
    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
    const model = parsed.message.model ?? 'unknown'

    const id = createHash('sha256')
      .update(`${filePath}:${parsed.uuid ?? parsed.timestamp}`)
      .digest('hex')
      .slice(0, 16)

    sessions.push({
      id: `cc-${id}`,
      tool: 'claude_code',
      model,
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens: 0,
      costMillicents: calculateCostMillicents({
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      }),
      cwd: parsed.cwd,
      gitBranch: parsed.gitBranch,
      startedAt: new Date(parsed.timestamp ?? Date.now()),
    })
  }

  return { sessions, newOffset: fileStats.size }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/claude-code-parser.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/claude-code.ts src/parsers/__fixtures__/claude-code.jsonl test/claude-code-parser.test.ts
git commit -m "feat(cli): add Claude Code JSONL parser with incremental offset reads"
```

---

## Task 5: Codex Parser

**Files:**
- Create: `cli/src/parsers/__fixtures__/codex.jsonl`
- Create: `cli/src/parsers/codex.ts`
- Create: `cli/test/codex-parser.test.ts`

- [ ] **Step 1: Create test fixture**

Create `cli/src/parsers/__fixtures__/codex.jsonl` with these lines (one JSON object per line):

Line 1: `{"timestamp":"2026-04-13T08:00:00.000Z","type":"session_meta","payload":{"id":"codex-sess-001","timestamp":"2026-04-13T08:00:00.000Z","cwd":"/Users/dev/my-project","originator":"codex_cli_rs","cli_version":"0.116.0","source":"cli","model_provider":"openai","git":{"commit_hash":"abc123","branch":"main","repository_url":"git@github.com:dev/my-project.git"}}}`

Line 2: `{"timestamp":"2026-04-13T08:00:01.000Z","type":"turn_context","payload":{"turn_id":"turn-001","cwd":"/Users/dev/my-project","model":"gpt-4.1","effort":"medium"}}`

Line 3: `{"timestamp":"2026-04-13T08:00:05.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":5000,"cached_input_tokens":1000,"output_tokens":200,"reasoning_output_tokens":0,"total_tokens":5200},"last_token_usage":{"input_tokens":5000,"cached_input_tokens":1000,"output_tokens":200,"reasoning_output_tokens":0,"total_tokens":5200}}}}`

Line 4: `{"timestamp":"2026-04-13T08:01:00.000Z","type":"turn_context","payload":{"turn_id":"turn-002","cwd":"/Users/dev/my-project","model":"gpt-4.1","effort":"high"}}`

Line 5: `{"timestamp":"2026-04-13T08:01:10.000Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":15000,"cached_input_tokens":6000,"output_tokens":800,"reasoning_output_tokens":50,"total_tokens":15800},"last_token_usage":{"input_tokens":10000,"cached_input_tokens":5000,"output_tokens":600,"reasoning_output_tokens":50,"total_tokens":10600}}}}`

- [ ] **Step 2: Write the failing tests**

```typescript
// test/codex-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseCodex } from '../src/parsers/codex.js'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'codex.jsonl')

describe('Codex parser', () => {
  it('parses token_count events into sessions', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions.length).toBe(2)
  })

  it('uses last_token_usage for per-turn counts', async () => {
    const result = await parseCodex(fixturePath, 0)
    const second = result.sessions[1]
    expect(second.inputTokens).toBe(10000)
    expect(second.outputTokens).toBe(600)
    expect(second.cacheReadTokens).toBe(5000)
    expect(second.reasoningTokens).toBe(50)
  })

  it('extracts model from turn_context', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions[0].model).toBe('gpt-4.1')
    expect(result.sessions[1].model).toBe('gpt-4.1')
  })

  it('extracts git info from session_meta', async () => {
    const result = await parseCodex(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.cwd).toBe('/Users/dev/my-project')
    expect(first.gitBranch).toBe('main')
    expect(first.gitRepo).toBe('dev/my-project')
  })

  it('sets tool to codex and provider to openai', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions[0].tool).toBe('codex')
    expect(result.sessions[0].provider).toBe('openai')
  })

  it('calculates cost', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions[0].costMillicents).toBeGreaterThan(0)
  })

  it('returns newOffset for incremental reads', async () => {
    const first = await parseCodex(fixturePath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseCodex(fixturePath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/codex-parser.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 4: Implement codex.ts**

```typescript
// src/parsers/codex.ts
import { readFile, stat } from 'fs/promises'
import { createHash } from 'crypto'
import type { Session, ParseResult } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

interface CodexSessionMeta {
  id: string
  cwd: string
  model_provider: string
  git?: {
    commit_hash?: string
    branch?: string
    repository_url?: string
  }
}

interface CodexLine {
  timestamp: string
  type: string
  payload: {
    id?: string
    cwd?: string
    model_provider?: string
    git?: { commit_hash?: string; branch?: string; repository_url?: string }
    turn_id?: string
    model?: string
    type?: string
    info?: {
      last_token_usage?: {
        input_tokens: number
        cached_input_tokens: number
        output_tokens: number
        reasoning_output_tokens: number
        total_tokens: number
      }
    }
  }
}

function extractRepoFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1]
}

export async function parseCodex(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) {
    return { sessions: [], newOffset: fromOffset }
  }

  const buffer = await readFile(filePath)
  const content = buffer.subarray(fromOffset).toString('utf-8')
  const lines = content.split('\n').filter(line => line.trim().length > 0)

  const sessions: Session[] = []
  let meta: CodexSessionMeta | null = null
  let currentModel = 'unknown'

  for (const line of lines) {
    let parsed: CodexLine
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (parsed.type === 'session_meta') {
      meta = {
        id: parsed.payload.id ?? 'unknown',
        cwd: parsed.payload.cwd ?? '',
        model_provider: parsed.payload.model_provider ?? 'openai',
        git: parsed.payload.git,
      }
      continue
    }

    if (parsed.type === 'turn_context' && parsed.payload.model) {
      currentModel = parsed.payload.model
      continue
    }

    if (parsed.type === 'event_msg' && parsed.payload.type === 'token_count') {
      const usage = parsed.payload.info?.last_token_usage
      if (!usage) continue

      const id = createHash('sha256')
        .update(`${filePath}:${parsed.timestamp}`)
        .digest('hex')
        .slice(0, 16)

      sessions.push({
        id: `codex-${id}`,
        tool: 'codex',
        model: currentModel,
        provider: meta?.model_provider ?? 'openai',
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cached_input_tokens,
        cacheWriteTokens: 0,
        reasoningTokens: usage.reasoning_output_tokens,
        costMillicents: calculateCostMillicents({
          model: currentModel,
          inputTokens: usage.input_tokens - usage.cached_input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cached_input_tokens,
          cacheWriteTokens: 0,
        }),
        cwd: meta?.cwd,
        gitRepo: extractRepoFromUrl(meta?.git?.repository_url),
        gitBranch: meta?.git?.branch,
        startedAt: new Date(parsed.timestamp),
      })
    }
  }

  return { sessions, newOffset: fileStats.size }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/codex-parser.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/codex.ts src/parsers/__fixtures__/codex.jsonl test/codex-parser.test.ts
git commit -m "feat(cli): add Codex JSONL parser with session_meta + turn_context tracking"
```

---

## Task 6: OpenCode Parser

**Files:**
- Create: `cli/src/parsers/__fixtures__/opencode-seed.sql`
- Create: `cli/src/parsers/opencode.ts`
- Create: `cli/test/opencode-parser.test.ts`

- [ ] **Step 1: Create test fixture SQL**

```sql
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  directory TEXT,
  title TEXT,
  time_created INTEGER,
  time_updated INTEGER
);

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  time_created INTEGER,
  time_updated INTEGER,
  data TEXT
);

INSERT INTO session (id, project_id, directory, title, time_created, time_updated)
VALUES ('ses-001', 'proj-001', '/Users/dev/my-project', 'Fix auth bug', 1712991600000, 1712991660000);

INSERT INTO message (id, session_id, time_created, time_updated, data)
VALUES ('msg-001', 'ses-001', 1712991600000, 1712991610000, '{"role":"user","time":{"created":1712991600000},"model":{"providerID":"openrouter","modelID":"google/gemini-3.1-pro-preview"}}');

INSERT INTO message (id, session_id, time_created, time_updated, data)
VALUES ('msg-002', 'ses-001', 1712991610000, 1712991620000, '{"role":"assistant","time":{"created":1712991610000,"completed":1712991620000},"modelID":"google/gemini-3.1-pro-preview","providerID":"openrouter","cost":0.045,"tokens":{"total":11778,"input":10791,"output":987,"reasoning":0,"cache":{"read":5000,"write":200}}}');

INSERT INTO message (id, session_id, time_created, time_updated, data)
VALUES ('msg-003', 'ses-001', 1712991630000, 1712991640000, '{"role":"assistant","time":{"created":1712991630000,"completed":1712991640000},"modelID":"google/gemini-3.1-pro-preview","providerID":"openrouter","cost":0.012,"tokens":{"total":3500,"input":3000,"output":500,"reasoning":100,"cache":{"read":1000,"write":0}}}');
```

- [ ] **Step 2: Write the failing tests**

```typescript
// test/opencode-parser.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseOpenCode } from '../src/parsers/opencode.js'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const seedSQL = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'opencode-seed.sql')

describe('OpenCode parser', () => {
  let dbPath: string
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'opencode-test-'))
    dbPath = path.join(tempDir, 'opencode.db')
    const db = new Database(dbPath)
    const sql = readFileSync(seedSQL, 'utf-8')
    db.exec(sql)
    db.close()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('parses assistant messages with token data', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions.length).toBe(2)
  })

  it('extracts token counts from message data', async () => {
    const result = await parseOpenCode(dbPath, 0)
    const first = result.sessions[0]
    expect(first.inputTokens).toBe(10791)
    expect(first.outputTokens).toBe(987)
    expect(first.cacheReadTokens).toBe(5000)
    expect(first.cacheWriteTokens).toBe(200)
  })

  it('uses direct cost from OpenCode when available', async () => {
    const result = await parseOpenCode(dbPath, 0)
    const first = result.sessions[0]
    // OpenCode stores cost in dollars: 0.045 -> 4500 millicents
    expect(first.costMillicents).toBe(4500)
  })

  it('extracts model and provider', async () => {
    const result = await parseOpenCode(dbPath, 0)
    const first = result.sessions[0]
    expect(first.model).toBe('google/gemini-3.1-pro-preview')
    expect(first.provider).toBe('openrouter')
  })

  it('extracts cwd from session directory', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[0].cwd).toBe('/Users/dev/my-project')
  })

  it('sets tool to opencode', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[0].tool).toBe('opencode')
  })

  it('uses timestamp as cursor for incremental reads', async () => {
    const first = await parseOpenCode(dbPath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseOpenCode(dbPath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })

  it('extracts reasoning tokens', async () => {
    const result = await parseOpenCode(dbPath, 0)
    const second = result.sessions[1]
    expect(second.reasoningTokens).toBe(100)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/opencode-parser.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 4: Implement opencode.ts**

```typescript
// src/parsers/opencode.ts
import Database from 'better-sqlite3'
import type { Session, ParseResult } from '../types.js'

interface OpenCodeMessageData {
  role: string
  modelID?: string
  providerID?: string
  cost?: number
  tokens?: {
    total: number
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  time?: {
    created: number
    completed?: number
  }
}

interface MessageRow {
  id: string
  session_id: string
  time_created: number
  data: string
  directory: string | null
}

export async function parseOpenCode(dbPath: string, fromOffset: number): Promise<ParseResult> {
  let db: InstanceType<typeof Database>
  try {
    db = new Database(dbPath, { readonly: true })
  } catch {
    return { sessions: [], newOffset: fromOffset }
  }

  try {
    const rows = db.prepare(`
      SELECT m.id, m.session_id, m.time_created, m.data, s.directory
      FROM message m
      JOIN session s ON s.id = m.session_id
      WHERE m.time_created > ?
      ORDER BY m.time_created ASC
    `).all(fromOffset) as MessageRow[]

    const sessions: Session[] = []
    let maxTimestamp = fromOffset

    for (const row of rows) {
      let data: OpenCodeMessageData
      try {
        data = JSON.parse(row.data)
      } catch {
        continue
      }

      if (data.role !== 'assistant' || !data.tokens) continue

      const costMillicents = data.cost != null
        ? Math.round(data.cost * 100_000)
        : 0

      sessions.push({
        id: `oc-${row.id}`,
        tool: 'opencode',
        model: data.modelID ?? 'unknown',
        provider: data.providerID ?? 'unknown',
        inputTokens: data.tokens.input,
        outputTokens: data.tokens.output,
        cacheReadTokens: data.tokens.cache.read,
        cacheWriteTokens: data.tokens.cache.write,
        reasoningTokens: data.tokens.reasoning,
        costMillicents,
        cwd: row.directory ?? undefined,
        startedAt: new Date(row.time_created),
        endedAt: data.time?.completed ? new Date(data.time.completed) : undefined,
      })

      if (row.time_created > maxTimestamp) {
        maxTimestamp = row.time_created
      }
    }

    return { sessions, newOffset: maxTimestamp }
  } finally {
    db.close()
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/opencode-parser.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/opencode.ts src/parsers/__fixtures__/opencode-seed.sql test/opencode-parser.test.ts
git commit -m "feat(cli): add OpenCode SQLite parser with direct cost extraction"
```

---

## Task 7: Gemini CLI Parser

**Files:**
- Create: `cli/src/parsers/__fixtures__/gemini-session.json`
- Create: `cli/src/parsers/gemini-cli.ts`
- Create: `cli/test/gemini-parser.test.ts`

- [ ] **Step 1: Create test fixture**

```json
{
  "sessionId": "gem-sess-001",
  "projectHash": "abc123",
  "startTime": "2026-04-13T08:00:00.000Z",
  "lastUpdated": "2026-04-13T08:10:00.000Z",
  "messages": [
    {
      "id": "msg-001",
      "timestamp": "2026-04-13T08:00:05.000Z",
      "type": "user",
      "content": [{"text": "Explain the authentication flow in this codebase. I need to understand how JWT tokens are issued and validated."}]
    },
    {
      "id": "msg-002",
      "timestamp": "2026-04-13T08:00:30.000Z",
      "type": "assistant",
      "content": [{"text": "The authentication flow works as follows:\n\n1. User logs in via GitHub OAuth\n2. Server validates the OAuth callback and creates a JWT\n3. JWT contains user_id and exp claims\n4. Client stores JWT and sends it in Authorization header\n5. Server validates JWT on each request using the shared secret\n\nThe key files are:\n- lib/json_web_token.rb for encoding/decoding\n- app/controllers/concerns/authenticatable.rb for the before_action\n- config/initializers/omniauth.rb for GitHub OAuth setup"}]
    },
    {
      "id": "msg-003",
      "timestamp": "2026-04-13T08:02:00.000Z",
      "type": "user",
      "content": [{"text": "Show me the JWT validation code"}]
    },
    {
      "id": "msg-004",
      "timestamp": "2026-04-13T08:02:20.000Z",
      "type": "assistant",
      "content": [{"text": "Here is the JWT validation:\n\ndef decode(token)\n  decoded = JWT.decode(token, SECRET, true, algorithm: 'HS256')\n  HashWithIndifferentAccess.new(decoded[0])\nrescue JWT::DecodeError => e\n  raise AuthenticationError, e.message\nend\n\nThe authenticate! before_action extracts the token from the Authorization header and calls this method."}]
    }
  ],
  "kind": "main"
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// test/gemini-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseGeminiCli } from '../src/parsers/gemini-cli.js'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'gemini-session.json')

describe('Gemini CLI parser', () => {
  it('parses assistant messages from session JSON', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions.length).toBe(2)
  })

  it('estimates tokens from message text length', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.outputTokens).toBeGreaterThan(0)
    expect(first.inputTokens).toBeGreaterThan(0)
  })

  it('marks sessions as estimated', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].estimated).toBe(true)
  })

  it('sets tool to gemini_cli', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].tool).toBe('gemini_cli')
  })

  it('defaults model to gemini-2.5-pro', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].model).toBe('gemini-2.5-pro')
  })

  it('extracts timestamps', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].startedAt).toEqual(new Date('2026-04-13T08:00:30.000Z'))
  })

  it('returns file size as newOffset', async () => {
    const first = await parseGeminiCli(fixturePath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseGeminiCli(fixturePath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/gemini-parser.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 4: Implement gemini-cli.ts**

```typescript
// src/parsers/gemini-cli.ts
import { readFile, stat } from 'fs/promises'
import { createHash } from 'crypto'
import type { Session, ParseResult } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

const DEFAULT_MODEL = 'gemini-2.5-pro'
const CHARS_PER_TOKEN = 4

interface GeminiMessage {
  id: string
  timestamp: string
  type: string
  content: string | Array<{ text: string }>
}

interface GeminiSession {
  sessionId: string
  startTime: string
  lastUpdated: string
  messages: GeminiMessage[]
}

function getMessageText(content: string | Array<{ text: string }>): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(c => c.text ?? '').join('\n')
  }
  return ''
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export async function parseGeminiCli(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) {
    return { sessions: [], newOffset: fromOffset }
  }

  const content = await readFile(filePath, 'utf-8')
  let parsed: GeminiSession
  try {
    parsed = JSON.parse(content)
  } catch {
    return { sessions: [], newOffset: fileStats.size }
  }

  const sessions: Session[] = []
  let cumulativeInputText = ''

  for (const msg of parsed.messages) {
    if (msg.type === 'user') {
      cumulativeInputText += getMessageText(msg.content) + '\n'
      continue
    }

    if (msg.type !== 'assistant') continue

    const outputText = getMessageText(msg.content)
    const outputTokens = estimateTokens(outputText)
    const inputTokens = estimateTokens(cumulativeInputText)

    cumulativeInputText += outputText + '\n'

    const id = createHash('sha256')
      .update(`${filePath}:${msg.id}`)
      .digest('hex')
      .slice(0, 16)

    sessions.push({
      id: `gem-${id}`,
      tool: 'gemini_cli',
      model: DEFAULT_MODEL,
      provider: 'google',
      inputTokens,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      costMillicents: calculateCostMillicents({
        model: DEFAULT_MODEL,
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
      startedAt: new Date(msg.timestamp),
      estimated: true,
    })
  }

  return { sessions, newOffset: fileStats.size }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/gemini-parser.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/parsers/gemini-cli.ts src/parsers/__fixtures__/gemini-session.json test/gemini-parser.test.ts
git commit -m "feat(cli): add Gemini CLI parser with token estimation from message text"
```

---

## Task 8: Git Attribution

**Files:**
- Create: `cli/src/services/git-attribution.ts`
- Create: `cli/test/git-attribution.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/git-attribution.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extractGitInfo } from '../src/services/git-attribution.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

describe('extractGitInfo', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'git-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('extracts repo and branch from a git directory', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(
      path.join(gitDir, 'config'),
      '[remote "origin"]\n\turl = git@github.com:user/my-repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n'
    )

    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBe('user/my-repo')
    expect(info.gitBranch).toBe('main')
  })

  it('handles HTTPS remote URLs', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/feature/auth\n')
    writeFileSync(
      path.join(gitDir, 'config'),
      '[remote "origin"]\n\turl = https://github.com/org/project.git\n'
    )

    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBe('org/project')
    expect(info.gitBranch).toBe('feature/auth')
  })

  it('handles detached HEAD (commit hash)', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'abc123def456\n')
    writeFileSync(
      path.join(gitDir, 'config'),
      '[remote "origin"]\n\turl = git@github.com:user/repo.git\n'
    )

    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBe('user/repo')
    expect(info.gitBranch).toBeUndefined()
  })

  it('returns empty object when no .git directory exists', async () => {
    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBeUndefined()
    expect(info.gitBranch).toBeUndefined()
  })

  it('walks up parent directories to find .git', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/develop\n')
    writeFileSync(
      path.join(gitDir, 'config'),
      '[remote "origin"]\n\turl = git@github.com:team/mono.git\n'
    )
    const subDir = path.join(tempDir, 'packages', 'core')
    mkdirSync(subDir, { recursive: true })

    const info = await extractGitInfo(subDir)
    expect(info.gitRepo).toBe('team/mono')
    expect(info.gitBranch).toBe('develop')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/git-attribution.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement git-attribution.ts**

```typescript
// src/services/git-attribution.ts
import { readFile, access } from 'fs/promises'
import path from 'path'

interface GitInfo {
  gitRepo?: string
  gitBranch?: string
}

async function findGitDir(cwd: string): Promise<string | null> {
  let dir = cwd
  const root = path.parse(dir).root

  while (dir !== root) {
    const gitPath = path.join(dir, '.git')
    try {
      await access(gitPath)
      return gitPath
    } catch {
      dir = path.dirname(dir)
    }
  }
  return null
}

function extractRepoFromUrl(url: string): string | undefined {
  const match = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1]
}

export async function extractGitInfo(cwd: string): Promise<GitInfo> {
  try {
    const gitDir = await findGitDir(cwd)
    if (!gitDir) return {}

    const [headContent, configContent] = await Promise.all([
      readFile(path.join(gitDir, 'HEAD'), 'utf-8').catch(() => ''),
      readFile(path.join(gitDir, 'config'), 'utf-8').catch(() => ''),
    ])

    let gitBranch: string | undefined
    const branchMatch = headContent.match(/^ref: refs\/heads\/(.+)/)
    if (branchMatch) {
      gitBranch = branchMatch[1].trim()
    }

    const urlMatch = configContent.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/m)
    const gitRepo = urlMatch ? extractRepoFromUrl(urlMatch[1].trim()) : undefined

    return { gitRepo, gitBranch }
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/git-attribution.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/git-attribution.ts test/git-attribution.test.ts
git commit -m "feat(cli): add git attribution - extract repo/branch from .git directory"
```

---

## Task 9: State Manager

**Files:**
- Create: `cli/src/services/state-manager.ts`
- Create: `cli/test/state-manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/state-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateManager } from '../src/services/state-manager.js'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

describe('StateManager', () => {
  let tempDir: string
  let sm: StateManager

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'state-test-'))
    sm = new StateManager(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns 0 for unknown file cursor', () => {
    expect(sm.getCursor('/some/file.jsonl')).toBe(0)
  })

  it('persists and retrieves cursors', () => {
    sm.setCursor('/some/file.jsonl', 4821)
    sm.save()

    const sm2 = new StateManager(tempDir)
    expect(sm2.getCursor('/some/file.jsonl')).toBe(4821)
  })

  it('updates existing cursor', () => {
    sm.setCursor('/some/file.jsonl', 100)
    sm.setCursor('/some/file.jsonl', 500)
    expect(sm.getCursor('/some/file.jsonl')).toBe(500)
  })

  it('handles multiple files', () => {
    sm.setCursor('/a.jsonl', 100)
    sm.setCursor('/b.jsonl', 200)
    sm.save()

    const sm2 = new StateManager(tempDir)
    expect(sm2.getCursor('/a.jsonl')).toBe(100)
    expect(sm2.getCursor('/b.jsonl')).toBe(200)
  })

  it('reads and writes budgets', () => {
    const budgets = [
      {
        id: 'b1',
        scope: 'global' as const,
        period: 'daily' as const,
        limitCents: 5000,
        alertAtPct: 80,
      },
    ]
    sm.saveBudgets(budgets)

    const sm2 = new StateManager(tempDir)
    const loaded = sm2.loadBudgets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].limitCents).toBe(5000)
  })

  it('returns empty array when no budgets file exists', () => {
    expect(sm.loadBudgets()).toEqual([])
  })

  it('detects server mode when auth.json exists', () => {
    expect(sm.isServerMode()).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/state-manager.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement state-manager.ts**

```typescript
// src/services/state-manager.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import type { Budget, CursorState } from '../types.js'

export class StateManager {
  private configDir: string
  private cursors: Record<string, number> = {}

  constructor(configDir?: string) {
    this.configDir = configDir ?? path.join(
      process.env.HOME ?? process.env.USERPROFILE ?? '~',
      '.config',
      'tokscale'
    )

    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true })
    }

    this.loadState()
  }

  private statePath(): string {
    return path.join(this.configDir, 'state.json')
  }

  private budgetsPath(): string {
    return path.join(this.configDir, 'budgets.json')
  }

  private authPath(): string {
    return path.join(this.configDir, 'auth.json')
  }

  private loadState(): void {
    try {
      const data = readFileSync(this.statePath(), 'utf-8')
      const state: CursorState = JSON.parse(data)
      this.cursors = state.cursors ?? {}
    } catch {
      this.cursors = {}
    }
  }

  getCursor(filePath: string): number {
    return this.cursors[filePath] ?? 0
  }

  setCursor(filePath: string, offset: number): void {
    this.cursors[filePath] = offset
  }

  save(): void {
    const state: CursorState = { cursors: this.cursors }
    writeFileSync(this.statePath(), JSON.stringify(state, null, 2))
  }

  loadBudgets(): Budget[] {
    try {
      const data = readFileSync(this.budgetsPath(), 'utf-8')
      return JSON.parse(data)
    } catch {
      return []
    }
  }

  saveBudgets(budgets: Budget[]): void {
    writeFileSync(this.budgetsPath(), JSON.stringify(budgets, null, 2))
  }

  isServerMode(): boolean {
    return existsSync(this.authPath())
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/state-manager.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/state-manager.ts test/state-manager.test.ts
git commit -m "feat(cli): add state manager for cursor persistence and budget storage"
```

---

## Task 10: Session Store (Aggregator)

**Files:**
- Create: `cli/src/services/session-store.ts`
- Create: `cli/src/parsers/index.ts`
- Create: `cli/test/session-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/session-store.test.ts
import { describe, it, expect } from 'vitest'
import { SessionStore } from '../src/services/session-store.js'
import type { Session } from '../src/types.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tool: 'claude_code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 500,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    costMillicents: 5000,
    startedAt: new Date('2026-04-13T10:00:00Z'),
    ...overrides,
  }
}

describe('SessionStore', () => {
  it('adds sessions and deduplicates by id', () => {
    const store = new SessionStore()
    const s = makeSession({ id: 'dup-1' })
    store.addSessions([s, s])
    expect(store.getAllSessions()).toHaveLength(1)
  })

  it('computes today stats', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      makeSession({ costMillicents: 3000, startedAt: today }),
      makeSession({ costMillicents: 7000, startedAt: today }),
    ])
    const stats = store.getTodayStats()
    expect(stats.costMillicents).toBe(10000)
    expect(stats.sessionCount).toBe(2)
  })

  it('computes stats by model', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      makeSession({ model: 'claude-opus-4-6', costMillicents: 8000, startedAt: today }),
      makeSession({ model: 'claude-sonnet-4-6', costMillicents: 3000, startedAt: today }),
      makeSession({ model: 'claude-opus-4-6', costMillicents: 2000, startedAt: today }),
    ])
    const models = store.getModelStats()
    const opus = models.find(m => m.model === 'claude-opus-4-6')
    expect(opus?.costMillicents).toBe(10000)
    expect(opus?.sessionCount).toBe(2)
  })

  it('computes stats by tool', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      makeSession({ tool: 'claude_code', costMillicents: 5000, startedAt: today }),
      makeSession({ tool: 'codex', costMillicents: 3000, startedAt: today }),
    ])
    const tools = store.getToolStats()
    expect(tools).toHaveLength(2)
    expect(tools.find(t => t.tool === 'codex')?.costMillicents).toBe(3000)
  })

  it('computes week stats (last 7 days)', () => {
    const store = new SessionStore()
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      store.addSessions([makeSession({ costMillicents: 1000 * (i + 1), startedAt: d })])
    }
    const week = store.getWeekStats()
    expect(week.length).toBe(7)
    expect(week.reduce((sum, d) => sum + d.costMillicents, 0)).toBe(28000)
  })

  it('computes repo stats', () => {
    const store = new SessionStore()
    store.addSessions([
      makeSession({ gitRepo: 'user/repo-a', costMillicents: 5000 }),
      makeSession({ gitRepo: 'user/repo-a', costMillicents: 3000 }),
      makeSession({ gitRepo: 'user/repo-b', costMillicents: 2000 }),
    ])
    const repos = store.getRepoStats()
    expect(repos).toHaveLength(2)
    const repoA = repos.find(r => r.repo === 'user/repo-a')
    expect(repoA?.costMillicents).toBe(8000)
  })

  it('returns week cost total', () => {
    const store = new SessionStore()
    const now = new Date()
    store.addSessions([
      makeSession({ costMillicents: 5000, startedAt: now }),
    ])
    expect(store.getWeekTotal()).toBe(5000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/session-store.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement session-store.ts**

```typescript
// src/services/session-store.ts
import type { Session, DayStats, ModelStats, ToolStats, RepoStats } from '../types.js'

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function todayKey(): string {
  return dateKey(new Date())
}

function isToday(d: Date): boolean {
  return dateKey(d) === todayKey()
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map()

  addSessions(newSessions: Session[]): void {
    for (const s of newSessions) {
      this.sessions.set(s.id, s)
    }
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
  }

  getTodayStats(): DayStats {
    let costMillicents = 0
    let inputTokens = 0
    let outputTokens = 0
    let sessionCount = 0

    for (const s of this.sessions.values()) {
      if (isToday(s.startedAt)) {
        costMillicents += s.costMillicents
        inputTokens += s.inputTokens
        outputTokens += s.outputTokens
        sessionCount++
      }
    }

    return { date: todayKey(), costMillicents, inputTokens, outputTokens, sessionCount }
  }

  getWeekTotal(): number {
    const weekStart = daysAgo(6)
    let total = 0
    for (const s of this.sessions.values()) {
      if (s.startedAt >= weekStart) {
        total += s.costMillicents
      }
    }
    return total
  }

  getWeekStats(): DayStats[] {
    const dayMap = new Map<string, DayStats>()

    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = dateKey(d)
      dayMap.set(key, { date: key, costMillicents: 0, inputTokens: 0, outputTokens: 0, sessionCount: 0 })
    }

    const weekStart = daysAgo(6)
    for (const s of this.sessions.values()) {
      if (s.startedAt >= weekStart) {
        const key = dateKey(s.startedAt)
        const day = dayMap.get(key)
        if (day) {
          day.costMillicents += s.costMillicents
          day.inputTokens += s.inputTokens
          day.outputTokens += s.outputTokens
          day.sessionCount++
        }
      }
    }

    return Array.from(dayMap.values())
  }

  getModelStats(): ModelStats[] {
    const map = new Map<string, ModelStats>()
    for (const s of this.sessions.values()) {
      if (!isToday(s.startedAt)) continue
      const existing = map.get(s.model)
      if (existing) {
        existing.costMillicents += s.costMillicents
        existing.inputTokens += s.inputTokens
        existing.outputTokens += s.outputTokens
        existing.sessionCount++
      } else {
        map.set(s.model, {
          model: s.model,
          costMillicents: s.costMillicents,
          inputTokens: s.inputTokens,
          outputTokens: s.outputTokens,
          sessionCount: 1,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.costMillicents - a.costMillicents)
  }

  getToolStats(): ToolStats[] {
    const map = new Map<string, ToolStats>()
    for (const s of this.sessions.values()) {
      if (!isToday(s.startedAt)) continue
      const existing = map.get(s.tool)
      if (existing) {
        existing.costMillicents += s.costMillicents
        existing.sessionCount++
      } else {
        map.set(s.tool, {
          tool: s.tool,
          costMillicents: s.costMillicents,
          sessionCount: 1,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.costMillicents - a.costMillicents)
  }

  getRepoStats(): RepoStats[] {
    const map = new Map<string, RepoStats>()
    for (const s of this.sessions.values()) {
      if (!s.gitRepo) continue
      const existing = map.get(s.gitRepo)
      if (existing) {
        existing.costMillicents += s.costMillicents
        existing.sessionCount++
        if (!existing.models.includes(s.model)) {
          existing.models.push(s.model)
        }
      } else {
        map.set(s.gitRepo, {
          repo: s.gitRepo,
          costMillicents: s.costMillicents,
          sessionCount: 1,
          models: [s.model],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.costMillicents - a.costMillicents)
  }

  getRecentSessions(limit: number = 20): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)
  }
}
```

- [ ] **Step 4: Create parser registry (parsers/index.ts)**

```typescript
// src/parsers/index.ts
import { glob } from 'glob'
import path from 'path'
import { parseClaudeCode } from './claude-code.js'
import { parseCodex } from './codex.js'
import { parseOpenCode } from './opencode.js'
import { parseGeminiCli } from './gemini-cli.js'
import { extractGitInfo } from '../services/git-attribution.js'
import type { Session, ParseResult } from '../types.js'
import type { StateManager } from '../services/state-manager.js'

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '~'

interface ParserDef {
  name: string
  globPattern: string
  parse: (filePath: string, fromOffset: number) => Promise<ParseResult>
}

const PARSERS: ParserDef[] = [
  {
    name: 'claude_code',
    globPattern: path.join(HOME, '.claude', 'projects', '**', '*.jsonl'),
    parse: parseClaudeCode,
  },
  {
    name: 'codex',
    globPattern: path.join(HOME, '.codex', 'sessions', '**', '*.jsonl'),
    parse: parseCodex,
  },
  {
    name: 'opencode',
    globPattern: path.join(HOME, '.local', 'share', 'opencode', 'opencode.db'),
    parse: parseOpenCode,
  },
  {
    name: 'gemini_cli',
    globPattern: path.join(HOME, '.gemini', 'tmp', '*', 'chats', '*.json'),
    parse: parseGeminiCli,
  },
]

export async function loadAllSessions(stateManager: StateManager): Promise<Session[]> {
  const allSessions: Session[] = []

  for (const parser of PARSERS) {
    const files = await glob(parser.globPattern)

    for (const filePath of files) {
      const cursor = stateManager.getCursor(filePath)
      try {
        const result = await parser.parse(filePath, cursor)
        stateManager.setCursor(filePath, result.newOffset)

        for (const session of result.sessions) {
          if (session.cwd && !session.gitRepo) {
            const gitInfo = await extractGitInfo(session.cwd)
            session.gitRepo = gitInfo.gitRepo
            if (!session.gitBranch) {
              session.gitBranch = gitInfo.gitBranch
            }
          }
        }

        allSessions.push(...result.sessions)
      } catch {
        continue
      }
    }
  }

  stateManager.save()
  return allSessions
}
```

- [ ] **Step 5: Run all tests**

Run: `cd cli && npx vitest run`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/session-store.ts src/parsers/index.ts test/session-store.test.ts
git commit -m "feat(cli): add session store with aggregation and parser registry"
```

---

## Task 11: Ink Foundation - Header, Loading, Animation Hooks

**Files:**
- Create: `cli/src/hooks/useAnimatedValue.ts`
- Create: `cli/src/components/Header.tsx`
- Create: `cli/src/components/Loading.tsx`

- [ ] **Step 1: Create useAnimatedValue hook**

```tsx
// src/hooks/useAnimatedValue.ts
import { useState, useEffect } from 'react'

export function useAnimatedValue(target: number, duration: number = 400): number {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (target === 0) {
      setCurrent(0)
      return
    }

    const startTime = Date.now()
    const startValue = current

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCurrent(Math.round(startValue + (target - startValue) * eased))

      if (progress >= 1) {
        clearInterval(timer)
        setCurrent(target)
      }
    }, 16)

    return () => clearInterval(timer)
  }, [target, duration])

  return current
}

export function useAnimatedCost(targetMillicents: number, duration: number = 600): string {
  const animated = useAnimatedValue(targetMillicents, duration)
  const dollars = animated / 100_000
  if (dollars >= 100) return `$${dollars.toFixed(0)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}
```

- [ ] **Step 2: Create Header component**

```tsx
// src/components/Header.tsx
import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import BigText from 'ink-big-text'

interface HeaderProps {
  compact?: boolean
}

export function Header({ compact: forceCompact }: HeaderProps) {
  const [compact, setCompact] = useState(forceCompact ?? false)

  useEffect(() => {
    if (forceCompact) return
    const timer = setTimeout(() => setCompact(true), 1500)
    return () => clearTimeout(timer)
  }, [forceCompact])

  if (compact) {
    return (
      <Box marginBottom={1}>
        <Gradient name="vice">
          <Text bold>{'\u25C6 tokscale'}</Text>
        </Gradient>
        <Text color="gray"> {'\u2014'} </Text>
        <Text color="gray">{new Date().toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient name="vice">
        <BigText text="tokscale" font="chrome" />
      </Gradient>
    </Box>
  )
}
```

- [ ] **Step 3: Create Loading component**

```tsx
// src/components/Loading.tsx
import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'

interface LoadingProps {
  message?: string
}

export function Loading({ message = 'Parsing session files...' }: LoadingProps) {
  return (
    <Box>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text color="gray"> {message}</Text>
    </Box>
  )
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd cli && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAnimatedValue.ts src/components/Header.tsx src/components/Loading.tsx
git commit -m "feat(cli): add animated value hooks, gradient header, and loading spinner"
```

---

## Task 12: Dashboard Components

**Files:**
- Create: `cli/src/components/ModelBreakdown.tsx`
- Create: `cli/src/components/ToolBreakdown.tsx`
- Create: `cli/src/components/WeekChart.tsx`
- Create: `cli/src/components/Dashboard.tsx`

- [ ] **Step 1: Create ModelBreakdown**

```tsx
// src/components/ModelBreakdown.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { ModelStats } from '../types.js'
import { getModelColor, formatCost, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function ModelRow({ stat, maxCost }: { stat: ModelStats; maxCost: number }) {
  const barWidth = 20
  const pct = maxCost > 0 ? stat.costMillicents / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 300)
  const color = getModelColor(stat.model)

  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))
  const pctDisplay = maxCost > 0 ? Math.round((stat.costMillicents / maxCost) * 100) : 0

  const displayName = stat.model.length > 24
    ? stat.model.slice(0, 21) + '...'
    : stat.model.padEnd(24)

  return (
    <Box>
      <Text color={color}>{displayName}</Text>
      <Text color="white" bold> {formatCost(stat.costMillicents).padStart(8)} </Text>
      <Text color={color}>{filled}</Text>
      <Text color="gray">{empty}</Text>
      <Text color="gray"> {String(pctDisplay).padStart(3)}%</Text>
    </Box>
  )
}

interface ModelBreakdownProps {
  models: ModelStats[]
}

export function ModelBreakdown({ models }: ModelBreakdownProps) {
  if (models.length === 0) {
    return (
      <Box>
        <Text color="gray" dimColor>No model data for today</Text>
      </Box>
    )
  }

  const totalCost = models.reduce((sum, m) => sum + m.costMillicents, 0)

  return (
    <Box flexDirection="column">
      {models.map(stat => (
        <ModelRow key={stat.model} stat={stat} maxCost={totalCost} />
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Create ToolBreakdown**

```tsx
// src/components/ToolBreakdown.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { ToolStats } from '../types.js'
import { TOOL_COLORS, TOOL_LABELS, formatCost } from '../theme.js'

interface ToolBreakdownProps {
  tools: ToolStats[]
}

export function ToolBreakdown({ tools }: ToolBreakdownProps) {
  if (tools.length === 0) return null

  return (
    <Box gap={2}>
      {tools.map((stat, i) => (
        <React.Fragment key={stat.tool}>
          {i > 0 && <Text color="gray">{'\u2502'}</Text>}
          <Box>
            <Text color={TOOL_COLORS[stat.tool] ?? 'white'}>
              {TOOL_LABELS[stat.tool] ?? stat.tool}
            </Text>
            <Text color="white" bold> {formatCost(stat.costMillicents)}</Text>
          </Box>
        </React.Fragment>
      ))}
    </Box>
  )
}
```

- [ ] **Step 3: Create WeekChart**

```tsx
// src/components/WeekChart.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { DayStats } from '../types.js'
import { formatCost, BAR_FULL } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return DAY_NAMES[d.getDay()]
}

function barColor(pct: number): string {
  if (pct < 0.4) return '#4CAF50'
  if (pct < 0.7) return '#FFC107'
  return '#FF5722'
}

function DayBar({ day, maxCost }: { day: DayStats; maxCost: number }) {
  const maxBarWidth = 30
  const pct = maxCost > 0 ? day.costMillicents / maxCost : 0
  const targetWidth = Math.round(pct * maxBarWidth)
  const animatedWidth = useAnimatedValue(targetWidth, 400)
  const bar = BAR_FULL.repeat(Math.max(0, animatedWidth))
  const color = barColor(pct)

  return (
    <Box>
      <Text color="gray">{dayLabel(day.date)} </Text>
      <Text color={color}>{bar}</Text>
      <Text color="gray"> {formatCost(day.costMillicents)}</Text>
    </Box>
  )
}

interface WeekChartProps {
  days: DayStats[]
}

export function WeekChart({ days }: WeekChartProps) {
  const maxCost = Math.max(...days.map(d => d.costMillicents), 1)

  return (
    <Box flexDirection="column">
      <Text color="gray" dimColor>7-day trend:</Text>
      {days.map(day => (
        <DayBar key={day.date} day={day} maxCost={maxCost} />
      ))}
    </Box>
  )
}
```

- [ ] **Step 4: Create Dashboard**

```tsx
// src/components/Dashboard.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { Header } from './Header.js'
import { ModelBreakdown } from './ModelBreakdown.js'
import { ToolBreakdown } from './ToolBreakdown.js'
import { WeekChart } from './WeekChart.js'
import { useAnimatedCost } from '../hooks/useAnimatedValue.js'
import type { SessionStore } from '../services/session-store.js'

interface DashboardProps {
  store: SessionStore
}

export function Dashboard({ store }: DashboardProps) {
  const today = store.getTodayStats()
  const weekTotal = store.getWeekTotal()
  const models = store.getModelStats()
  const tools = store.getToolStats()
  const weekDays = store.getWeekStats()

  const todayCost = useAnimatedCost(today.costMillicents)
  const weekCost = useAnimatedCost(weekTotal)

  const separator = '\u2500'.repeat(50)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header compact />

      <Box marginBottom={1} gap={4}>
        <Box>
          <Text color="gray">Today: </Text>
          <Text color="#4CAF50" bold>{todayCost}</Text>
        </Box>
        <Box>
          <Text color="gray">Week: </Text>
          <Text color="#64B5F6" bold>{weekCost}</Text>
        </Box>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray" dimColor>{separator}</Text>
      </Box>

      <Box marginBottom={1} flexDirection="column">
        <ModelBreakdown models={models} />
      </Box>

      <Box marginBottom={1}>
        <Text color="gray" dimColor>{separator}</Text>
      </Box>

      <Box marginBottom={1}>
        <ToolBreakdown tools={tools} />
      </Box>

      <Box marginBottom={1}>
        <Text color="gray" dimColor>{separator}</Text>
      </Box>

      <Box marginBottom={1}>
        <WeekChart days={weekDays} />
      </Box>

      <Box>
        <Text color="cyan">/ commands</Text>
        <Text color="gray">  {'\u2022'}  </Text>
        <Text color="gray">q quit</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd cli && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ModelBreakdown.tsx src/components/ToolBreakdown.tsx src/components/WeekChart.tsx src/components/Dashboard.tsx
git commit -m "feat(cli): add dashboard components - model bars, tool summary, week chart"
```

---

## Task 13: Command Input + View Router

**Files:**
- Create: `cli/src/components/CommandInput.tsx`
- Create: `cli/src/components/HelpView.tsx`
- Create: `cli/src/views/index.ts`

- [ ] **Step 1: Create HelpView**

```tsx
// src/components/HelpView.tsx
import React from 'react'
import { Box, Text } from 'ink'

interface HelpViewProps {
  serverMode: boolean
}

const LOCAL_COMMANDS = [
  { cmd: '/dashboard', desc: 'Overview dashboard (default)' },
  { cmd: '/repos', desc: 'Cost grouped by git repository' },
  { cmd: '/models', desc: 'Detailed model breakdown' },
  { cmd: '/sessions', desc: 'Recent session list' },
  { cmd: '/timeline', desc: 'Day-by-day cost timeline' },
  { cmd: '/budget', desc: 'Budget status' },
  { cmd: '/budget set', desc: 'Set a new budget' },
  { cmd: '/help', desc: 'Show this help' },
]

const SERVER_COMMANDS = [
  { cmd: '/login', desc: 'Authenticate with server' },
  { cmd: '/push', desc: 'Sync sessions to server' },
  { cmd: '/watch', desc: 'Continuous sync loop' },
  { cmd: '/team', desc: 'Team member breakdown' },
  { cmd: '/anomalies', desc: 'Recent anomaly alerts' },
]

export function HelpView({ serverMode }: HelpViewProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Available Commands</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray" dimColor>Local:</Text>
        {LOCAL_COMMANDS.map(c => (
          <Box key={c.cmd} gap={2}>
            <Text color="#7C6FE0">{c.cmd.padEnd(16)}</Text>
            <Text color="gray">{c.desc}</Text>
          </Box>
        ))}
      </Box>

      {serverMode && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="gray" dimColor>Server:</Text>
          {SERVER_COMMANDS.map(c => (
            <Box key={c.cmd} gap={2}>
              <Text color="#E8A838">{c.cmd.padEnd(16)}</Text>
              <Text color="gray">{c.desc}</Text>
            </Box>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="gray">Press </Text>
        <Text color="white">Esc</Text>
        <Text color="gray"> to return to dashboard, </Text>
        <Text color="white">q</Text>
        <Text color="gray"> to quit</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Create CommandInput**

```tsx
// src/components/CommandInput.tsx
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export type ViewName =
  | 'dashboard'
  | 'repos'
  | 'models'
  | 'sessions'
  | 'timeline'
  | 'budget'
  | 'budget-set'
  | 'help'

interface CommandInputProps {
  onNavigate: (view: ViewName) => void
  onQuit: () => void
}

const COMMAND_MAP: Record<string, ViewName> = {
  '/dashboard': 'dashboard',
  '/repos': 'repos',
  '/models': 'models',
  '/sessions': 'sessions',
  '/timeline': 'timeline',
  '/budget': 'budget',
  '/budget set': 'budget-set',
  '/help': 'help',
}

export function CommandInput({ onNavigate, onQuit }: CommandInputProps) {
  const [input, setInput] = useState('')
  const [active, setActive] = useState(false)

  useInput((ch, key) => {
    if (!active) {
      if (ch === '/') {
        setActive(true)
        setInput('/')
        return
      }
      if (ch === 'q') {
        onQuit()
        return
      }
      if (key.escape) {
        onNavigate('dashboard')
        return
      }
      return
    }

    if (key.return) {
      const view = COMMAND_MAP[input.trim()]
      if (view) {
        onNavigate(view)
      }
      setInput('')
      setActive(false)
      return
    }

    if (key.escape) {
      setInput('')
      setActive(false)
      return
    }

    if (key.backspace || key.delete) {
      if (input.length <= 1) {
        setInput('')
        setActive(false)
      } else {
        setInput(input.slice(0, -1))
      }
      return
    }

    if (ch && !key.ctrl && !key.meta) {
      setInput(input + ch)
    }
  })

  if (!active) return null

  return (
    <Box>
      <Text color="cyan" bold>{'> '}</Text>
      <Text color="white">{input}</Text>
      <Text color="gray">{'\u2588'}</Text>
    </Box>
  )
}
```

- [ ] **Step 3: Create views/index.ts**

```typescript
// src/views/index.ts
export { Dashboard } from '../components/Dashboard.js'
export { HelpView } from '../components/HelpView.js'
export type { ViewName } from '../components/CommandInput.js'
```

- [ ] **Step 4: Verify compilation**

Run: `cd cli && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/CommandInput.tsx src/components/HelpView.tsx src/views/index.ts
git commit -m "feat(cli): add / command input with view routing and help view"
```

---

## Task 14: Budget System

**Files:**
- Create: `cli/src/components/BudgetBar.tsx`
- Create: `cli/src/components/BudgetView.tsx`
- Create: `cli/src/hooks/useBudget.ts`
- Create: `cli/test/budget.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// test/budget.test.ts
import { describe, it, expect } from 'vitest'
import { checkBudgets } from '../src/hooks/useBudget.js'
import type { Budget, Session } from '../src/types.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tool: 'claude_code',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    costMillicents: 5000,
    startedAt: new Date(),
    ...overrides,
  }
}

describe('checkBudgets', () => {
  it('calculates spend percentage for global daily budget', () => {
    const budgets: Budget[] = [
      { id: 'b1', scope: 'global', period: 'daily', limitCents: 100, alertAtPct: 80 },
    ]
    // costMillicents 50000 = 50 cents out of 100 cent limit = 50%
    const sessions = [makeSession({ costMillicents: 50_000 })]
    const results = checkBudgets(budgets, sessions)
    expect(results).toHaveLength(1)
    expect(results[0].spentCents).toBe(50)
    expect(results[0].pct).toBe(50)
    expect(results[0].alert).toBe(false)
  })

  it('triggers alert when over threshold', () => {
    const budgets: Budget[] = [
      { id: 'b1', scope: 'global', period: 'daily', limitCents: 100, alertAtPct: 80 },
    ]
    const sessions = [makeSession({ costMillicents: 90_000 })]
    const results = checkBudgets(budgets, sessions)
    expect(results[0].pct).toBe(90)
    expect(results[0].alert).toBe(true)
  })

  it('scopes by repo when budget scope is repo', () => {
    const budgets: Budget[] = [
      { id: 'b1', scope: 'repo', scopeValue: 'user/repo-a', period: 'daily', limitCents: 200, alertAtPct: 80 },
    ]
    const sessions = [
      makeSession({ gitRepo: 'user/repo-a', costMillicents: 100_000 }),
      makeSession({ gitRepo: 'user/repo-b', costMillicents: 50_000 }),
    ]
    const results = checkBudgets(budgets, sessions)
    expect(results[0].spentCents).toBe(100) // only repo-a
  })

  it('handles weekly period', () => {
    const budgets: Budget[] = [
      { id: 'b1', scope: 'global', period: 'weekly', limitCents: 1000, alertAtPct: 80 },
    ]
    const now = new Date()
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const sessions = [
      makeSession({ costMillicents: 300_000, startedAt: now }),
      makeSession({ costMillicents: 200_000, startedAt: twoDaysAgo }),
    ]
    const results = checkBudgets(budgets, sessions)
    expect(results[0].spentCents).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/budget.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement useBudget.ts**

```typescript
// src/hooks/useBudget.ts
import type { Budget, Session } from '../types.js'

export interface BudgetResult {
  budget: Budget
  spentCents: number
  pct: number
  alert: boolean
}

function periodStart(period: Budget['period']): Date {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  if (period === 'daily') return now

  if (period === 'weekly') {
    const day = now.getDay()
    now.setDate(now.getDate() - day)
    return now
  }

  now.setDate(1)
  return now
}

export function checkBudgets(budgets: Budget[], sessions: Session[]): BudgetResult[] {
  return budgets.map(budget => {
    const start = periodStart(budget.period)

    let relevantSessions = sessions.filter(s => s.startedAt >= start)

    if (budget.scope === 'repo' && budget.scopeValue) {
      relevantSessions = relevantSessions.filter(s => s.gitRepo === budget.scopeValue)
    } else if (budget.scope === 'project' && budget.scopeValue) {
      relevantSessions = relevantSessions.filter(s => s.cwd?.startsWith(budget.scopeValue!))
    }

    const spentMillicents = relevantSessions.reduce((sum, s) => sum + s.costMillicents, 0)
    const spentCents = Math.round(spentMillicents / 1000)
    const pct = budget.limitCents > 0 ? Math.round((spentCents / budget.limitCents) * 100) : 0

    return {
      budget,
      spentCents,
      pct,
      alert: pct >= budget.alertAtPct,
    }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd cli && npx vitest run test/budget.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Create BudgetBar component**

```tsx
// src/components/BudgetBar.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { budgetColor, formatCost, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface BudgetBarProps {
  result: BudgetResult
}

export function BudgetBar({ result }: BudgetBarProps) {
  const barWidth = 25
  const clampedPct = Math.min(result.pct, 100)
  const animatedFill = useAnimatedValue(Math.round((clampedPct / 100) * barWidth), 500)
  const color = budgetColor(result.pct)

  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))

  const label = result.budget.scope === 'global'
    ? `Global ${result.budget.period}`
    : `${result.budget.scopeValue} ${result.budget.period}`

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="white">{label.padEnd(30)}</Text>
        <Text color={color}>{filled}</Text>
        <Text color="gray">{empty}</Text>
        <Text color={color} bold> {result.pct}%</Text>
      </Box>
      <Box>
        <Text color="gray">
          {'  '}
          {formatCost(result.spentCents * 1000)} / {formatCost(result.budget.limitCents * 1000)}
        </Text>
      </Box>
    </Box>
  )
}

export function BudgetAlert({ result }: BudgetBarProps) {
  if (!result.alert) return null

  const label = result.budget.scope === 'global'
    ? 'All projects'
    : result.budget.scopeValue ?? ''

  return (
    <Box
      borderStyle="bold"
      borderColor="red"
      paddingX={2}
      paddingY={0}
      marginBottom={1}
    >
      <Text color="red" bold>
        {'\u26A0  Budget alert: '}{label}
        {'  '}
        {formatCost(result.spentCents * 1000)} / {formatCost(result.budget.limitCents * 1000)}
        {' '}{result.budget.period} limit ({result.pct}%)
      </Text>
    </Box>
  )
}
```

- [ ] **Step 6: Create BudgetView component**

```tsx
// src/components/BudgetView.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { BudgetBar } from './BudgetBar.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface BudgetViewProps {
  results: BudgetResult[]
}

export function BudgetView({ results }: BudgetViewProps) {
  if (results.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>Budgets</Text>
        </Box>
        <Text color="gray">No budgets configured.</Text>
        <Text color="gray" dimColor>Use <Text color="cyan">/budget set</Text> to create one.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Budgets</Text>
      </Box>
      {results.map(r => (
        <Box key={r.budget.id} marginBottom={1}>
          <BudgetBar result={r} />
        </Box>
      ))}
    </Box>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBudget.ts src/components/BudgetBar.tsx src/components/BudgetView.tsx test/budget.test.ts
git commit -m "feat(cli): add budget system with animated progress bars and alert boxes"
```

---

## Task 15: Additional Views - Sessions, Repos, Timeline, Models

**Files:**
- Create: `cli/src/components/SessionList.tsx`
- Create: `cli/src/components/RepoView.tsx`
- Create: `cli/src/components/TimelineView.tsx`
- Create: `cli/src/components/ModelView.tsx`

- [ ] **Step 1: Create SessionList**

```tsx
// src/components/SessionList.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { Session } from '../types.js'
import { formatCost, getModelColor, TOOL_LABELS, formatTokens } from '../theme.js'

interface SessionListProps {
  sessions: Session[]
}

export function SessionList({ sessions }: SessionListProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Recent Sessions</Text>
        <Text color="gray"> ({sessions.length})</Text>
      </Box>

      {sessions.length === 0 && (
        <Text color="gray">No sessions found.</Text>
      )}

      {sessions.length > 0 && (
        <Box marginBottom={0}>
          <Text color="gray" dimColor>
            {'Time'.padEnd(8)}
            {'Tool'.padEnd(14)}
            {'Model'.padEnd(26)}
            {'Tokens'.padEnd(10)}
            {'Cost'.padStart(8)}
          </Text>
        </Box>
      )}

      {sessions.map(s => {
        const time = s.startedAt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
        const toolLabel = (TOOL_LABELS[s.tool] ?? s.tool).padEnd(14)
        const modelName = (s.model.length > 24 ? s.model.slice(0, 21) + '...' : s.model).padEnd(26)
        const totalTokens = s.inputTokens + s.outputTokens
        const tokensStr = formatTokens(totalTokens).padEnd(10)

        return (
          <Box key={s.id}>
            <Text color="gray">{time.padEnd(8)}</Text>
            <Text color="white">{toolLabel}</Text>
            <Text color={getModelColor(s.model)}>{modelName}</Text>
            <Text color="gray">{tokensStr}</Text>
            <Text color="white" bold>{formatCost(s.costMillicents).padStart(8)}</Text>
            {s.estimated && <Text color="yellow"> ~</Text>}
          </Box>
        )
      })}

      <Box marginTop={1}>
        <Text color="gray" dimColor>~ = estimated tokens (Gemini CLI)</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Create RepoView**

```tsx
// src/components/RepoView.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { RepoStats } from '../types.js'
import { formatCost, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function RepoRow({ stat, maxCost }: { stat: RepoStats; maxCost: number }) {
  const barWidth = 20
  const pct = maxCost > 0 ? stat.costMillicents / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 300)

  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))

  const repoName = stat.repo.length > 28
    ? '...' + stat.repo.slice(-25)
    : stat.repo.padEnd(28)

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="#7C6FE0">{repoName}</Text>
        <Text color="white" bold> {formatCost(stat.costMillicents).padStart(8)} </Text>
        <Text color="#5CB8B2">{filled}</Text>
        <Text color="gray">{empty}</Text>
        <Text color="gray"> {stat.sessionCount} sessions</Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>{'  '}{stat.models.join(', ')}</Text>
      </Box>
    </Box>
  )
}

interface RepoViewProps {
  repos: RepoStats[]
}

export function RepoView({ repos }: RepoViewProps) {
  if (repos.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>Repositories</Text>
        </Box>
        <Text color="gray">No repository data found. Sessions need a git working directory.</Text>
      </Box>
    )
  }

  const maxCost = Math.max(...repos.map(r => r.costMillicents), 1)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Repositories</Text>
        <Text color="gray"> ({repos.length})</Text>
      </Box>
      {repos.map(stat => (
        <Box key={stat.repo} marginBottom={1}>
          <RepoRow stat={stat} maxCost={maxCost} />
        </Box>
      ))}
    </Box>
  )
}
```

- [ ] **Step 3: Create TimelineView**

```tsx
// src/components/TimelineView.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { DayStats } from '../types.js'
import { formatCost, formatTokens, BAR_FULL } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function TimelineRow({ day, maxCost }: { day: DayStats; maxCost: number }) {
  const barWidth = 25
  const pct = maxCost > 0 ? day.costMillicents / maxCost : 0
  const animatedWidth = useAnimatedValue(Math.round(pct * barWidth), 400)
  const bar = BAR_FULL.repeat(Math.max(0, animatedWidth))

  const dateObj = new Date(day.date + 'T12:00:00')
  const dateStr = dateObj.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const color = pct < 0.5 ? '#4CAF50' : pct < 0.8 ? '#FFC107' : '#FF5722'

  return (
    <Box>
      <Text color="gray">{dateStr.padEnd(14)}</Text>
      <Text color={color}>{bar.padEnd(barWidth)}</Text>
      <Text color="white" bold> {formatCost(day.costMillicents).padStart(8)}</Text>
      <Text color="gray"> {formatTokens(day.inputTokens + day.outputTokens).padStart(8)} tok</Text>
      <Text color="gray" dimColor> {String(day.sessionCount).padStart(3)} sess</Text>
    </Box>
  )
}

interface TimelineViewProps {
  days: DayStats[]
}

export function TimelineView({ days }: TimelineViewProps) {
  const maxCost = Math.max(...days.map(d => d.costMillicents), 1)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Timeline</Text>
        <Text color="gray"> (last 7 days)</Text>
      </Box>
      {days.map(day => (
        <TimelineRow key={day.date} day={day} maxCost={maxCost} />
      ))}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Total: {formatCost(days.reduce((s, d) => s + d.costMillicents, 0))}
          {' '}across {days.reduce((s, d) => s + d.sessionCount, 0)} sessions
        </Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 4: Create ModelView**

```tsx
// src/components/ModelView.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { ModelStats } from '../types.js'
import { getModelColor, formatCost, formatTokens, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function ModelDetailRow({ stat, maxCost }: { stat: ModelStats; maxCost: number }) {
  const barWidth = 20
  const pct = maxCost > 0 ? stat.costMillicents / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 300)
  const color = getModelColor(stat.model)

  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>{stat.model}</Text>
      </Box>
      <Box>
        <Text color={color}>  {filled}</Text>
        <Text color="gray">{empty}</Text>
        <Text color="white" bold> {formatCost(stat.costMillicents)}</Text>
      </Box>
      <Box>
        <Text color="gray" dimColor>
          {'  '}
          In: {formatTokens(stat.inputTokens)}
          {'  '}Out: {formatTokens(stat.outputTokens)}
          {'  '}{stat.sessionCount} calls
        </Text>
      </Box>
    </Box>
  )
}

interface ModelViewProps {
  models: ModelStats[]
}

export function ModelView({ models }: ModelViewProps) {
  if (models.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text color="cyan" bold>Models</Text>
        </Box>
        <Text color="gray">No model data for today.</Text>
      </Box>
    )
  }

  const totalCost = models.reduce((sum, m) => sum + m.costMillicents, 0)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Models</Text>
        <Text color="gray"> {'\u2014'} today's usage by model</Text>
      </Box>
      {models.map(stat => (
        <ModelDetailRow key={stat.model} stat={stat} maxCost={totalCost} />
      ))}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Total: {formatCost(totalCost)} across {models.reduce((s, m) => s + m.sessionCount, 0)} calls
        </Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 5: Update views/index.ts**

```typescript
// src/views/index.ts
export { Dashboard } from '../components/Dashboard.js'
export { HelpView } from '../components/HelpView.js'
export { SessionList } from '../components/SessionList.js'
export { RepoView } from '../components/RepoView.js'
export { TimelineView } from '../components/TimelineView.js'
export { ModelView } from '../components/ModelView.js'
export { BudgetView } from '../components/BudgetView.js'
export type { ViewName } from '../components/CommandInput.js'
```

- [ ] **Step 6: Verify compilation**

Run: `cd cli && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/SessionList.tsx src/components/RepoView.tsx src/components/TimelineView.tsx src/components/ModelView.tsx src/views/index.ts
git commit -m "feat(cli): add session list, repo, timeline, and model detail views"
```

---

## Task 16: App Root + CLI Entry Point

**Files:**
- Create: `cli/src/app.tsx`
- Modify: `cli/src/index.tsx`
- Create: `cli/src/hooks/useSessions.ts`

- [ ] **Step 1: Create useSessions hook**

```tsx
// src/hooks/useSessions.ts
import { useState, useEffect } from 'react'
import { SessionStore } from '../services/session-store.js'
import { StateManager } from '../services/state-manager.js'
import { loadAllSessions } from '../parsers/index.js'
import { checkBudgets, type BudgetResult } from './useBudget.js'

interface UseSessionsResult {
  store: SessionStore
  budgetResults: BudgetResult[]
  loading: boolean
  error: string | null
  serverMode: boolean
}

export function useSessions(): UseSessionsResult {
  const [store] = useState(() => new SessionStore())
  const [stateManager] = useState(() => new StateManager())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [budgetResults, setBudgetResults] = useState<BudgetResult[]>([])
  const [serverMode] = useState(() => stateManager.isServerMode())

  useEffect(() => {
    async function load() {
      try {
        const sessions = await loadAllSessions(stateManager)
        store.addSessions(sessions)

        const budgets = stateManager.loadBudgets()
        if (budgets.length > 0) {
          setBudgetResults(checkBudgets(budgets, store.getAllSessions()))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  return { store, budgetResults, loading, error, serverMode }
}
```

- [ ] **Step 2: Create app.tsx**

```tsx
// src/app.tsx
import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import { Loading } from './components/Loading.js'
import { Dashboard } from './components/Dashboard.js'
import { HelpView } from './components/HelpView.js'
import { SessionList } from './components/SessionList.js'
import { RepoView } from './components/RepoView.js'
import { TimelineView } from './components/TimelineView.js'
import { ModelView } from './components/ModelView.js'
import { BudgetView } from './components/BudgetView.js'
import { BudgetAlert } from './components/BudgetBar.js'
import { CommandInput, type ViewName } from './components/CommandInput.js'
import { useSessions } from './hooks/useSessions.js'

interface AppProps {
  onExit: () => void
}

export function App({ onExit }: AppProps) {
  const { store, budgetResults, loading, error, serverMode } = useSessions()
  const [view, setView] = useState<ViewName>('dashboard')

  const handleNavigate = useCallback((newView: ViewName) => {
    setView(newView)
  }, [])

  if (loading) {
    return <Loading />
  }

  if (error) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red" bold>Error: {error}</Text>
        <Text color="gray">Check that session file directories exist and are readable.</Text>
      </Box>
    )
  }

  const alerts = budgetResults.filter(r => r.alert)

  function renderView() {
    switch (view) {
      case 'dashboard':
        return <Dashboard store={store} />
      case 'help':
        return <HelpView serverMode={serverMode} />
      case 'sessions':
        return <SessionList sessions={store.getRecentSessions(30)} />
      case 'repos':
        return <RepoView repos={store.getRepoStats()} />
      case 'timeline':
        return <TimelineView days={store.getWeekStats()} />
      case 'models':
        return <ModelView models={store.getModelStats()} />
      case 'budget':
        return <BudgetView results={budgetResults} />
      default:
        return <Dashboard store={store} />
    }
  }

  return (
    <Box flexDirection="column">
      {alerts.map(r => (
        <BudgetAlert key={r.budget.id} result={r} />
      ))}

      {renderView()}

      <CommandInput onNavigate={handleNavigate} onQuit={onExit} />
    </Box>
  )
}
```

- [ ] **Step 3: Create index.tsx entry point**

```tsx
// src/index.tsx
import React from 'react'
import { render } from 'ink'
import { App } from './app.js'

const { waitUntilExit, unmount } = render(
  <App onExit={() => {
    unmount()
    process.exit(0)
  }} />
)

waitUntilExit().then(() => {
  process.exit(0)
})
```

- [ ] **Step 4: Build and verify**

Run: `cd cli && npx tsup`
Expected: Build succeeds, `dist/index.js` created.

- [ ] **Step 5: Smoke test**

Run: `cd cli && node dist/index.js`
Expected: TUI renders with loading spinner, then dashboard. Press `q` to quit.

- [ ] **Step 6: Make bin executable**

Run: `chmod +x cli/bin/tokscale.js`

- [ ] **Step 7: Commit**

```bash
git add src/app.tsx src/index.tsx src/hooks/useSessions.ts bin/tokscale.js
git commit -m "feat(cli): wire up app root with view routing, session loading, and CLI entry"
```

---

## Task 17: Integration Test + Final Polish

- [ ] **Step 1: Run full test suite**

Run: `cd cli && npx vitest run`
Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `cd cli && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build production bundle**

Run: `cd cli && npx tsup`
Expected: Clean build.

- [ ] **Step 4: Smoke test the full TUI**

Run: `cd cli && node dist/index.js`

Test:
- Dashboard renders with today's cost
- Press `/` then type `help` then Enter - help view shows
- Press Esc - back to dashboard
- Press `/` then type `repos` then Enter - repos view
- Press `/` then type `sessions` then Enter - sessions list
- Press `/` then type `models` then Enter - models detail
- Press `/` then type `timeline` then Enter - timeline
- Press `q` - app exits

- [ ] **Step 5: Test with npm link**

Run: `cd cli && npm link`
Then: `tokscale`
Expected: Same TUI renders when invoked as `tokscale` command.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(cli): complete tokscale CLI v0.1.0 - local-first AI spend tracker"
```
