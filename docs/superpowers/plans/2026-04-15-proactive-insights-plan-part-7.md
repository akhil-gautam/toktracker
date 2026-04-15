# Plan Part 7 — Phase 7: TUI + Daemon + CLI polish

Parent plan: `2026-04-15-proactive-insights-plan.md`
Reference spec: §8, §9, §10.

Depends on: Parts 1–6. Adds four new TUI tabs (Insights, Rules, Attribution, Hooks), two overlays (`!` CLAUDE.md suggestions, `@` saved command candidates), the real-time context HUD, the daemon for non-hook tools, and all remaining CLI commands.

---

## Task 7.1: Data hooks — useDetections, useRules, usePrAttributions, useContextHud

**Files:** create under `cli/src/hooks/`, tests under `cli/test/`

- [ ] **Step 1: Write failing test for useDetections**

Write to `cli/test/hooks/useDetections.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { DetectionsRepo } from '../../src/db/repository.js'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { useDetections } from '../../src/hooks/useDetections.js'

const tmp = join(tmpdir(), `tokscale-hookU-${Date.now()}.db`)

function Probe({ onValue }: { onValue: (n: number) => void }) {
  const dets = useDetections(getDb(tmp), 10)
  React.useEffect(() => { onValue(dets.length) }, [dets.length])
  return null
}

describe('useDetections', () => {
  it('returns recent detections', async () => {
    const db = getDb(tmp); migrate(db)
    new DetectionsRepo(db).insert({ sessionId: 's', ruleId: 'A1_redundant_tool_call', severity: 'warn', summary: 'x', createdAt: 1 })
    let lastLen = -1
    render(React.createElement(Probe, { onValue: (n) => { lastLen = n } }))
    await new Promise(r => setTimeout(r, 50))
    expect(lastLen).toBe(1)
    closeDb()
    for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} }
  })
})
```

- [ ] **Step 2: Implement useDetections**

Write to `cli/src/hooks/useDetections.ts`:

```ts
import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { DetectionsRepo, type DetectionRow } from '../db/repository.js'

export function useDetections(db: Database.Database, limit = 50): DetectionRow[] {
  const [rows, setRows] = useState<DetectionRow[]>([])
  useEffect(() => {
    const load = () => setRows(new DetectionsRepo(db).recent(limit))
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [db, limit])
  return rows
}
```

- [ ] **Step 3: Implement useRules**

Write to `cli/src/hooks/useRules.ts`:

```ts
import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { FeatureFlagsRepo } from '../db/repository.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import type { Rule } from '../detection/types.js'

export interface RuleRow {
  id: string
  category: string
  enabled: boolean
  hardBlock: boolean
  thresholds: Record<string, number>
  defaultThresholds: Record<string, number>
}

export function useRules(db: Database.Database, allRules: Rule[]): {
  rows: RuleRow[]
  toggle: (id: string) => void
  setHardBlock: (id: string, on: boolean) => void
  setThreshold: (id: string, key: string, value: number) => void
} {
  const [rows, setRows] = useState<RuleRow[]>([])
  const reload = () => {
    const loader = new ThresholdLoader(db)
    setRows(allRules.map(r => {
      const t = loader.load(r.id, r.defaultThresholds)
      return { id: r.id, category: r.category, enabled: t.enabled, hardBlock: t.hardBlock, thresholds: t.thresholds, defaultThresholds: r.defaultThresholds }
    }))
  }
  useEffect(() => { reload() }, [db])

  const flags = new FeatureFlagsRepo(db)
  const write = (id: string, patch: Record<string, unknown>) => {
    const existing = flags.get(id)?.config ?? {}
    flags.set(id, { ...existing, ...patch })
    reload()
  }

  return {
    rows,
    toggle(id) { const r = rows.find(x => x.id === id); if (r) write(id, { enabled: !r.enabled }) },
    setHardBlock(id, on) { write(id, { hard_block: on }) },
    setThreshold(id, key, value) {
      const r = rows.find(x => x.id === id); if (!r) return
      write(id, { thresholds: { ...r.thresholds, [key]: value } })
    },
  }
}
```

- [ ] **Step 4: Implement usePrAttributions + useContextHud**

Write to `cli/src/hooks/usePrAttributions.ts`:

```ts
import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { PrAttributionsRepo } from '../db/repository.js'

export interface PrSummary {
  repo: string
  prNumber: number
  costCents: number
  sessions: number
}

export function usePrAttributions(db: Database.Database): PrSummary[] {
  const [rows, setRows] = useState<PrSummary[]>([])
  useEffect(() => {
    const load = () => {
      const groups = db.prepare(`
        SELECT repo, pr_number, COUNT(*) as sessions
        FROM pr_attributions GROUP BY repo, pr_number ORDER BY pr_number DESC LIMIT 100
      `).all() as Array<{ repo: string; pr_number: number; sessions: number }>
      const repo = new PrAttributionsRepo(db)
      setRows(groups.map(g => ({
        repo: g.repo, prNumber: g.pr_number, sessions: g.sessions,
        costCents: repo.totalCostCentsForPr(g.repo, g.pr_number),
      })))
    }
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [db])
  return rows
}
```

Write to `cli/src/hooks/useContextHud.ts`:

```ts
import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'

export interface HudState {
  contextUsed: number
  contextLimit: number
  etaTurns: number | null
  todayCostCents: number
}

export function useContextHud(db: Database.Database, activeSessionId?: string): HudState {
  const [state, setState] = useState<HudState>({ contextUsed: 0, contextLimit: 200_000, etaTurns: null, todayCostCents: 0 })
  useEffect(() => {
    const load = () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayRow = db.prepare('SELECT COALESCE(SUM(cost_millicents),0) as c FROM sessions WHERE started_at >= ?').get(todayStart.getTime()) as { c: number }
      if (!activeSessionId) {
        setState(s => ({ ...s, todayCostCents: Math.round(todayRow.c / 10) }))
        return
      }
      const usedRow = db.prepare(`
        SELECT COALESCE(SUM(input_tokens+output_tokens),0) as used, COUNT(*) as turns
        FROM messages WHERE session_id = ? AND role = 'assistant'
      `).get(activeSessionId) as { used: number; turns: number }
      const limit = 200_000
      const etaTurns = usedRow.turns > 0 ? Math.max(0, Math.floor((limit - usedRow.used) / (usedRow.used / usedRow.turns))) : null
      setState({ contextUsed: usedRow.used, contextLimit: limit, etaTurns, todayCostCents: Math.round(todayRow.c / 10) })
    }
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [db, activeSessionId])
  return state
}
```

- [ ] **Step 5: Commit**

```bash
cd cli && npm run lint
git add src/hooks test/hooks
git commit -m "feat(hooks): useDetections, useRules, usePrAttributions, useContextHud"
```

---

## Task 7.2: InsightsTab component

**Files:** create `cli/src/components/InsightsTab.tsx`

- [ ] **Step 1: Implement**

Write to `cli/src/components/InsightsTab.tsx`:

```tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { useDetections } from '../hooks/useDetections.js'
import { DetectionsRepo } from '../db/repository.js'
import { formatHint } from '../detection/hints/formatters.js'
import { theme } from '../theme.js'

export function InsightsTab({ db }: { db: Database.Database }) {
  const detections = useDetections(db, 50)
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(detections.length - 1, c + 1))
    if (input === 'a' && detections[cursor]?.id) new DetectionsRepo(db).acknowledge(detections[cursor].id!)
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Insights (j/k navigate, a acknowledge)</Text>
      {detections.length === 0 ? <Text dimColor>No detections yet.</Text> : detections.map((d, i) => (
        <Text key={d.id} color={severityColor(d.severity)} inverse={i === cursor}>
          [{d.severity.toUpperCase()}] {formatHint({ ruleId: d.ruleId, severity: d.severity as any, summary: d.summary })}
        </Text>
      ))}
    </Box>
  )
}

function severityColor(sev: string): string {
  if (sev === 'block') return 'red'
  if (sev === 'warn') return 'yellow'
  return theme.accent ?? 'cyan'
}
```

If `theme.accent` does not exist, replace with a literal color like `'cyan'`.

- [ ] **Step 2: Commit**

```bash
cd cli && npm run lint
git add src/components/InsightsTab.tsx
git commit -m "feat(tui): InsightsTab"
```

---

## Task 7.3: RulesTab component

**Files:** create `cli/src/components/RulesTab.tsx`

- [ ] **Step 1: Implement**

Write to `cli/src/components/RulesTab.tsx`:

```tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { useRules } from '../hooks/useRules.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'

const registry = new RuleRegistry()
registerAllRules(registry)

export function RulesTab({ db }: { db: Database.Database }) {
  const { rows, toggle, setHardBlock } = useRules(db, registry.all())
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(rows.length - 1, c + 1))
    if (input === ' ') toggle(rows[cursor].id)
    if (input === 'b') setHardBlock(rows[cursor].id, !rows[cursor].hardBlock)
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Rules (space toggle, b hard-block)</Text>
      {rows.map((r, i) => (
        <Text key={r.id} inverse={i === cursor}>
          {r.enabled ? '●' : '○'} [{r.category}] {r.id} {r.hardBlock ? '[BLOCK]' : ''} — {Object.entries(r.thresholds).map(([k, v]) => `${k}=${v}`).join(' ')}
        </Text>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd cli && npm run lint
git add src/components/RulesTab.tsx
git commit -m "feat(tui): RulesTab toggles + hard-block + threshold view"
```

---

## Task 7.4: AttributionTab + HooksTab components

**Files:** create `cli/src/components/AttributionTab.tsx`, `cli/src/components/HooksTab.tsx`

- [ ] **Step 1: Implement Attribution**

Write to `cli/src/components/AttributionTab.tsx`:

```tsx
import React from 'react'
import { Box, Text } from 'ink'
import type Database from 'better-sqlite3'
import { usePrAttributions } from '../hooks/usePrAttributions.js'

export function AttributionTab({ db }: { db: Database.Database }) {
  const rows = usePrAttributions(db)
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Cost per merged PR</Text>
      {rows.length === 0 ? <Text dimColor>No PR attributions yet.</Text> : rows.map(r => (
        <Text key={`${r.repo}#${r.prNumber}`}>
          {r.repo} PR #{r.prNumber} — ${(r.costCents / 100).toFixed(2)} across {r.sessions} session{r.sessions === 1 ? '' : 's'}
        </Text>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Implement Hooks**

Write to `cli/src/components/HooksTab.tsx`:

```tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { installHook, uninstallHook, hookStatus } from '../hook/install.js'
import { HookEventsRepo } from '../db/repository.js'

export function HooksTab({ db }: { db: Database.Database }) {
  const [global, setGlobal] = React.useState(hookStatus(join(homedir(), '.claude', 'settings.json')))
  const [local, setLocal] = React.useState(hookStatus(join(process.cwd(), '.claude', 'settings.json')))
  const latency = new HookEventsRepo(db).latencyPercentiles(500)
  useInput((input) => {
    if (input === 'i') { installHook(join(homedir(), '.claude', 'settings.json'), 'tokscale hook exec'); setGlobal(hookStatus(join(homedir(), '.claude', 'settings.json'))) }
    if (input === 'u') { uninstallHook(join(homedir(), '.claude', 'settings.json')); setGlobal(hookStatus(join(homedir(), '.claude', 'settings.json'))) }
    if (input === 'I') { installHook(join(process.cwd(), '.claude', 'settings.json'), 'tokscale hook exec'); setLocal(hookStatus(join(process.cwd(), '.claude', 'settings.json'))) }
    if (input === 'U') { uninstallHook(join(process.cwd(), '.claude', 'settings.json')); setLocal(hookStatus(join(process.cwd(), '.claude', 'settings.json'))) }
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Hook installation (i/u global, I/U local)</Text>
      <Text>Global: {global.installed ? 'installed' : 'missing'} ({global.kinds.join(',')})</Text>
      <Text>Local: {local.installed ? 'installed' : 'missing'} ({local.kinds.join(',')})</Text>
      <Text>Latency: p50={latency.p50}ms p95={latency.p95}ms (n={latency.count})</Text>
    </Box>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd cli && npm run lint
git add src/components/AttributionTab.tsx src/components/HooksTab.tsx
git commit -m "feat(tui): AttributionTab + HooksTab"
```

---

## Task 7.5: ContextHud component + tab-bar detection badge

**Files:** create `cli/src/components/ContextHud.tsx`, modify `cli/src/components/TabBar.tsx`, `cli/src/app.tsx`

- [ ] **Step 1: Implement ContextHud**

Write to `cli/src/components/ContextHud.tsx`:

```tsx
import React from 'react'
import { Box, Text } from 'ink'
import { useContextHud } from '../hooks/useContextHud.js'
import type Database from 'better-sqlite3'

export function ContextHud({ db, sessionId }: { db: Database.Database; sessionId?: string }) {
  const { contextUsed, contextLimit, etaTurns, todayCostCents } = useContextHud(db, sessionId)
  const pct = contextLimit > 0 ? Math.round((contextUsed / contextLimit) * 100) : 0
  const color = pct >= 90 ? 'red' : pct >= 75 ? 'yellow' : 'cyan'
  return (
    <Box>
      <Text color={color}>
        ctx {Math.round(contextUsed / 1000)}k/{Math.round(contextLimit / 1000)}k ({pct}%) · ETA {etaTurns ?? '—'} turns · today ${(todayCostCents / 100).toFixed(2)}
      </Text>
    </Box>
  )
}
```

- [ ] **Step 2: Update TabBar to include new tabs and unread badge**

Read `cli/src/components/TabBar.tsx`. Add entries for `Insights` (key `7`), `Rules` (key `8`), `Attribution` (key `9`), `Hooks` (key `0`). Show badge count when `unreadDetections > 0` is passed as a prop.

```tsx
export function TabBar({ active, unreadDetections = 0 }: { active: string; unreadDetections?: number }) {
  const TABS = ['Overview','Models','Daily','Repos','Budget','Sessions','Insights','Rules','Attribution','Hooks'] as const
  return (
    <Box>
      {TABS.map(name => {
        const isActive = name === active
        const label = name === 'Insights' && unreadDetections > 0 ? `${name}(${unreadDetections})` : name
        return <Text key={name} color={isActive ? 'cyan' : undefined} bold={isActive}>{label}  </Text>
      })}
    </Box>
  )
}
```

- [ ] **Step 3: Wire app.tsx to new tabs + HUD**

In `cli/src/app.tsx`:

1. After `bootDb()` import, initialize `const db = bootDb()` inside app so new tabs and HUD can use it.
2. Import the four new tab components and `ContextHud`.
3. Add keys `7`, `8`, `9`, `0` to the `useTabNavigation` mapping.
4. Render the HUD in the top-right strip.
5. Pass `unreadDetections` (count of detections with `acknowledged_at IS NULL`) into `<TabBar />`.

Example patch in `cli/src/app.tsx`:

```tsx
import { bootDb } from './db/boot.js'
import { InsightsTab } from './components/InsightsTab.js'
import { RulesTab } from './components/RulesTab.js'
import { AttributionTab } from './components/AttributionTab.js'
import { HooksTab } from './components/HooksTab.js'
import { ContextHud } from './components/ContextHud.js'

// inside App component
const db = React.useMemo(() => bootDb(), [])
const unread = (db.prepare('SELECT COUNT(*) as c FROM detections WHERE acknowledged_at IS NULL').get() as { c: number }).c
// ... in the JSX tree ...
// Top row: <Box justifyContent="space-between"><TabBar active={tab} unreadDetections={unread} /><ContextHud db={db} sessionId={undefined} /></Box>
// Body: switch on tab — include InsightsTab, RulesTab, AttributionTab, HooksTab for the new keys.
```

- [ ] **Step 4: Commit**

```bash
cd cli && npm run build
./bin/tokscale.js   # smoke: arrow through all tabs
git add src/components/ContextHud.tsx src/components/TabBar.tsx src/app.tsx
git commit -m "feat(tui): HUD + new tabs wired into app, tab-bar badge"
```

---

## Task 7.6: CLAUDE.md suggestion overlay (`!`) and saved-command overlay (`@`)

**Files:** create `cli/src/components/ClaudeMdOverlay.tsx`, `cli/src/components/SavedCommandOverlay.tsx`, modify `cli/src/app.tsx`

- [ ] **Step 1: Implement ClaudeMdOverlay**

Write to `cli/src/components/ClaudeMdOverlay.tsx`:

```tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

interface Suggestion { id: number; text: string }

function loadSuggestions(db: Database.Database): Suggestion[] {
  const rows = db.prepare(`
    SELECT id, summary, suggested_action_json FROM detections
    WHERE suggested_action_json IS NOT NULL AND suggested_action_json LIKE '%claude_md_edit%'
    ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{ id: number; summary: string; suggested_action_json: string }>
  return rows.map(r => ({ id: r.id, text: r.summary }))
}

export function ClaudeMdOverlay({ db, onClose }: { db: Database.Database; onClose: () => void }) {
  const [items, setItems] = React.useState<Suggestion[]>(loadSuggestions(db))
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.escape) onClose()
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(items.length - 1, c + 1))
    if (input === 'a' && items[cursor]) {
      const path = join(process.cwd(), 'CLAUDE.md')
      const line = `\n- ${items[cursor].text}\n`
      if (existsSync(path)) appendFileSync(path, line)
      else writeFileSync(path, `# Project notes\n${line}`)
      setItems(items.filter((_, i) => i !== cursor))
      setCursor(c => Math.max(0, c - 1))
    }
  })
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold>CLAUDE.md suggestions (a apply, esc close)</Text>
      {items.length === 0 ? <Text dimColor>Nothing to apply.</Text> : items.map((s, i) => (
        <Text key={s.id} inverse={i === cursor}>• {s.text}</Text>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Implement SavedCommandOverlay**

Write to `cli/src/components/SavedCommandOverlay.tsx`:

```tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

interface Candidate { id: number; prefix: string }

function loadCandidates(db: Database.Database): Candidate[] {
  const rows = db.prepare(`
    SELECT id, metadata_json FROM detections
    WHERE rule_id = 'B9_prompt_pattern' ORDER BY created_at DESC LIMIT 20
  `).all() as Array<{ id: number; metadata_json: string }>
  return rows.map(r => ({ id: r.id, prefix: JSON.parse(r.metadata_json || '{}').prefix ?? '' })).filter(c => c.prefix)
}

export function SavedCommandOverlay({ db, onClose }: { db: Database.Database; onClose: () => void }) {
  const [items, setItems] = React.useState(loadCandidates(db))
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.escape) onClose()
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(items.length - 1, c + 1))
    if (input === 's' && items[cursor]) {
      const name = items[cursor].prefix.split(/\s+/).slice(0, 3).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '')
      const dir = join(process.cwd(), '.claude', 'commands')
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${name || 'saved'}.md`), `${items[cursor].prefix}\n`)
      setItems(items.filter((_, i) => i !== cursor))
      setCursor(c => Math.max(0, c - 1))
    }
  })
  return (
    <Box flexDirection="column" padding={1} borderStyle="round">
      <Text bold>Saved command candidates (s save, esc close)</Text>
      {items.length === 0 ? <Text dimColor>Nothing to save.</Text> : items.map((c, i) => (
        <Text key={c.id} inverse={i === cursor}>• {c.prefix}</Text>
      ))}
    </Box>
  )
}
```

- [ ] **Step 3: Wire overlays into app.tsx**

Intercept `!` and `@` in the root input handler; when triggered, render the overlay instead of the tab body until `onClose` fires.

- [ ] **Step 4: Commit**

```bash
cd cli && npm run build && ./bin/tokscale.js
git add src/components/ClaudeMdOverlay.tsx src/components/SavedCommandOverlay.tsx src/app.tsx
git commit -m "feat(tui): CLAUDE.md + saved-command suggestion overlays"
```

---

## Task 7.7: Daemon for non-hook tools

**Files:** create `cli/src/daemon/pidfile.ts`, `cli/src/daemon/poller.ts`, `cli/src/daemon/notifier.ts`, `cli/src/daemon/runner.ts`, test `cli/test/daemon/poller.test.ts`

- [ ] **Step 1: Pidfile implementation**

Write to `cli/src/daemon/pidfile.ts`:

```ts
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { pidFilePath } from '../db/paths.js'

export function writePid(): void {
  writeFileSync(pidFilePath(), String(process.pid))
}
export function readPid(): number | null {
  if (!existsSync(pidFilePath())) return null
  const n = parseInt(readFileSync(pidFilePath(), 'utf8'), 10)
  return Number.isFinite(n) ? n : null
}
export function clearPid(): void {
  if (existsSync(pidFilePath())) unlinkSync(pidFilePath())
}
export function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}
```

- [ ] **Step 2: Notifier wrapper**

Write to `cli/src/daemon/notifier.ts`:

```ts
import notifier from 'node-notifier'
import type { Detection } from '../detection/types.js'

export function notify(detection: Detection): void {
  try {
    notifier.notify({
      title: `tokscale: ${detection.ruleId}`,
      message: detection.summary,
      sound: detection.severity === 'block',
    })
  } catch {}
}
```

- [ ] **Step 3: Poller test**

Write to `cli/test/daemon/poller.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { Poller } from '../../src/daemon/poller.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import type { Rule } from '../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-poller-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('Poller', () => {
  it('invokes detection runner and calls notify on warn', async () => {
    const db = getDb(tmp)
    const rule: Rule = {
      id: 'R', category: 'A', triggers: ['PollTick'], defaultSeverity: 'warn',
      hardBlockEligible: false, defaultThresholds: {},
      evaluate: () => ({ ruleId: 'R', severity: 'warn', summary: 'poll warn' }),
    }
    const reg = new RuleRegistry(); reg.register(rule)
    const notify = vi.fn()
    const p = new Poller(db, reg, { notify })
    await p.tick()
    expect(notify).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Poller implementation**

Write to `cli/src/daemon/poller.ts`:

```ts
import type Database from 'better-sqlite3'
import type { RuleRegistry } from '../detection/registry.js'
import { DetectionRunner } from '../detection/runner.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import type { Detection } from '../detection/types.js'

export interface PollerDeps {
  notify?: (d: Detection) => void
}

export class Poller {
  private runner: DetectionRunner
  private notify: (d: Detection) => void
  constructor(db: Database.Database, registry: RuleRegistry, deps: PollerDeps = {}) {
    this.runner = new DetectionRunner(db, registry, new ThresholdLoader(db), { budgetMs: 500 })
    this.notify = deps.notify ?? (() => {})
  }
  async tick(): Promise<void> {
    const ctx = {
      db: (this.runner as any).db as Database.Database,
      trigger: 'PollTick' as const,
      timestamp: Date.now(),
      thresholds: {},
      hardBlockEnabled: false,
      now: () => Date.now(),
    }
    const { detections } = await this.runner.run(ctx)
    for (const d of detections) if (d.severity !== 'info') this.notify(d)
  }
}
```

Note: `runner.db` is marked private; if TypeScript complains, expose it as `readonly` on `DetectionRunner` or pass `db` into the Poller separately.

- [ ] **Step 5: Daemon runner**

Write to `cli/src/daemon/runner.ts`:

```ts
import { bootDb } from '../db/boot.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'
import { Poller } from './poller.js'
import { notify } from './notifier.js'
import { writePid, clearPid } from './pidfile.js'
import { maybeRunNightly } from '../scheduler/cron.js'

export async function runDaemon(intervalMs = 30_000): Promise<void> {
  writePid()
  const db = bootDb()
  const registry = new RuleRegistry()
  registerAllRules(registry)
  const poller = new Poller(db, registry, { notify })

  const cleanup = () => { clearPid(); process.exit(0) }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  while (true) {
    try { await poller.tick() } catch {}
    try { await maybeRunNightly(db, registry) } catch {}
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
```

- [ ] **Step 6: Verify + commit**

```bash
cd cli && npx vitest run test/daemon/poller.test.ts
git add src/daemon test/daemon
git commit -m "feat(daemon): poller + notifier + pidfile + runner"
```

---

## Task 7.8: CLI commands — daemon, redact, rules, export, privacy

**Files:** create `cli/src/cli/daemon-commands.ts`, `redact-commands.ts`, `rules-commands.ts`, `export-commands.ts`, `privacy-commands.ts`; modify `cli/src/cli/index.ts`

- [ ] **Step 1: Daemon commands**

Write to `cli/src/cli/daemon-commands.ts`:

```ts
import type { Command } from 'commander'
import { spawn } from 'node:child_process'
import { readPid, clearPid, isRunning } from '../daemon/pidfile.js'
import { runDaemon } from '../daemon/runner.js'

export function registerDaemonCommands(program: Command): void {
  const daemon = program.command('daemon').description('Background watcher for non-hook tools')
  daemon.command('start')
    .option('--detach', 'run detached')
    .action(async (opts) => {
      if (opts.detach) {
        const child = spawn(process.argv[0], [process.argv[1], 'daemon', 'start'], { detached: true, stdio: 'ignore' })
        child.unref()
        process.stdout.write(`daemon started pid=${child.pid}\n`)
        return
      }
      await runDaemon()
    })
  daemon.command('stop').action(() => {
    const pid = readPid()
    if (!pid) { process.stdout.write('not running\n'); return }
    try { process.kill(pid, 'SIGTERM') } catch {}
    clearPid()
    process.stdout.write('stopped\n')
  })
  daemon.command('status').action(() => {
    const pid = readPid()
    process.stdout.write(pid && isRunning(pid) ? `running pid=${pid}\n` : 'stopped\n')
  })
}
```

- [ ] **Step 2: Redact commands**

Write to `cli/src/cli/redact-commands.ts`:

```ts
import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { RedactionRulesRepo } from '../redaction/repository.js'
import { Redactor } from '../redaction/pipeline.js'
import { readFileSync } from 'node:fs'

export function registerRedactCommands(program: Command): void {
  const redact = program.command('redact').description('Manage redaction rules')
  redact.command('list').action(() => {
    const rows = new RedactionRulesRepo(bootDb()).all()
    for (const r of rows) process.stdout.write(`${r.id}\t${r.enabled ? 'on' : 'off'}\t${r.builtin ? 'builtin' : 'user'}\t${r.pattern} → ${r.replacement}\n`)
  })
  redact.command('add <pattern>').option('--replacement <s>', '', '[REDACTED]').action((pattern, opts) => {
    const r = new RedactionRulesRepo(bootDb()).add(pattern, opts.replacement)
    process.stdout.write(`added id=${r.id}\n`)
  })
  redact.command('remove <id>').action((id) => {
    new RedactionRulesRepo(bootDb()).remove(parseInt(id, 10))
  })
  redact.command('test <file>').action((file) => {
    const redactor = new Redactor(new RedactionRulesRepo(bootDb()).all())
    process.stdout.write(redactor.apply(readFileSync(file, 'utf8')))
  })
}
```

- [ ] **Step 3: Rules commands**

Write to `cli/src/cli/rules-commands.ts`:

```ts
import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { FeatureFlagsRepo } from '../db/repository.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'
import { ThresholdLoader } from '../detection/thresholds.js'

export function registerRulesCommands(program: Command): void {
  const r = program.command('rules').description('Manage detection rules')
  r.command('list').action(() => {
    const db = bootDb()
    const reg = new RuleRegistry(); registerAllRules(reg)
    const loader = new ThresholdLoader(db)
    for (const rule of reg.all()) {
      const t = loader.load(rule.id, rule.defaultThresholds)
      process.stdout.write(`[${rule.category}] ${rule.id}\t${t.enabled ? 'on' : 'off'}\thard=${t.hardBlock}\tthresholds=${JSON.stringify(t.thresholds)}\n`)
    }
  })
  r.command('enable <id>').action(id => setFlag(id, { enabled: true }))
  r.command('disable <id>').action(id => setFlag(id, { enabled: false }))
  r.command('hard-block <id>').action(id => setFlag(id, { hard_block: true }))
  r.command('set-threshold <id> <key> <value>').action((id, key, value) => {
    const db = bootDb()
    const flags = new FeatureFlagsRepo(db)
    const existing = flags.get(id)?.config ?? {}
    const thresholds = (existing.thresholds as Record<string, number> | undefined) ?? {}
    thresholds[key] = Number(value)
    flags.set(id, { ...existing, thresholds })
  })
}

function setFlag(id: string, patch: Record<string, unknown>): void {
  const db = bootDb()
  const flags = new FeatureFlagsRepo(db)
  const existing = flags.get(id)?.config ?? {}
  flags.set(id, { ...existing, ...patch })
}
```

- [ ] **Step 4: Export + privacy commands**

Write to `cli/src/cli/export-commands.ts`:

```ts
import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'

export function registerExportCommands(program: Command): void {
  program.command('export').option('--since <date>', '', '1970-01-01').action((opts) => {
    const db = bootDb()
    const since = Date.parse(opts.since) || 0
    const sessions = db.prepare('SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at').all(since)
    const detections = db.prepare('SELECT * FROM detections WHERE created_at >= ?').all(since)
    process.stdout.write(JSON.stringify({ sessions, detections }, null, 2))
  })
  program.command('vacuum').action(async () => {
    const { purge } = await import('../db/retention.js')
    const r = purge(bootDb(), 90)
    process.stdout.write(JSON.stringify(r) + '\n')
  })
}
```

Write to `cli/src/cli/privacy-commands.ts`:

```ts
import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { rmSync } from 'node:fs'
import { dbPath, configDir } from '../db/paths.js'
import { closeDb } from '../db/connection.js'
import { createInterface } from 'node:readline/promises'

export function registerPrivacyCommands(program: Command): void {
  const privacy = program.command('privacy').description('Inspect or wipe stored data')
  privacy.command('audit').action(() => {
    const db = bootDb()
    const counts: Record<string, number> = {}
    for (const t of ['sessions','messages','tool_calls','hook_events','git_events','detections','redaction_rules']) {
      counts[t] = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c
    }
    process.stdout.write(JSON.stringify(counts, null, 2) + '\n')
  })
  program.command('wipe').action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('type WIPE to destroy all local data: ')
    rl.close()
    if (answer !== 'WIPE') { process.stdout.write('aborted\n'); return }
    closeDb()
    try { rmSync(dbPath()) } catch {}
    for (const suffix of ['-wal', '-shm']) { try { rmSync(dbPath() + suffix) } catch {} }
    process.stdout.write(`wiped contents under ${configDir()}\n`)
  })
}
```

- [ ] **Step 5: Wire all into cli/index.ts**

Update `cli/src/cli/index.ts` to call every `registerXCommands`:

```ts
#!/usr/bin/env node
import { Command } from 'commander'
import { registerHookCommands } from './hook-commands.js'
import { registerDaemonCommands } from './daemon-commands.js'
import { registerRedactCommands } from './redact-commands.js'
import { registerRulesCommands } from './rules-commands.js'
import { registerExportCommands } from './export-commands.js'
import { registerPrivacyCommands } from './privacy-commands.js'

const program = new Command()
program.name('tokscale').description('AI coding tool tracker').version('0.2.0')
registerHookCommands(program)
registerDaemonCommands(program)
registerRedactCommands(program)
registerRulesCommands(program)
registerExportCommands(program)
registerPrivacyCommands(program)
program.parseAsync(process.argv).catch(err => {
  process.stderr.write(`error: ${err.message}\n`)
  process.exit(1)
})
```

- [ ] **Step 6: Build + smoke test each command**

```bash
cd cli && npm run build
./bin/tokscale.js rules list
./bin/tokscale.js redact list
./bin/tokscale.js privacy audit
./bin/tokscale.js daemon status
```
Expected: each prints structured output; no crashes.

- [ ] **Step 7: Commit**

```bash
cd cli && git add src/cli
git commit -m "feat(cli): daemon/redact/rules/export/privacy commands"
```

---

## Task 7.9: End-to-end integration tests

**Files:** create `cli/test/integration/e2e-hook.test.ts`, `e2e-backfill.test.ts`, `e2e-nightly.test.ts`

- [ ] **Step 1: Hook e2e**

Write to `cli/test/integration/e2e-hook.test.ts`:

```ts
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
    expect(res.additionalContext ?? '').toContain('A1_redundant_tool_call')
  })
})
```

- [ ] **Step 2: Backfill e2e**

Write to `cli/test/integration/e2e-backfill.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../src/db/repository.js'
import { RedactionRulesRepo } from '../../src/redaction/repository.js'
import { backfill } from '../../src/capture/backfill.js'

const dir = join(tmpdir(), `tokscale-bf-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const dbPath = join(dir, 'd.db')

afterEach(() => { closeDb(); try { rmSync(dir, { recursive: true }) } catch {} })

describe('E2E backfill', () => {
  it('ingests a small JSONL and exposes messages for rule queries', async () => {
    const db = getDb(dbPath); migrate(db); new RedactionRulesRepo(db).seedBuiltins()
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1 })
    const file = join(dir, 's.jsonl')
    writeFileSync(file, [
      { type: 'user', sessionId: 'S', timestamp: '2026-04-10T00:00:00Z', message: { content: 'hi' } },
      { type: 'assistant', sessionId: 'S', timestamp: '2026-04-10T00:00:05Z', message: { content: 'hello', usage: { input_tokens: 10, output_tokens: 5 } } },
    ].map(o => JSON.stringify(o)).join('\n'))
    const r = await backfill(db, 'claude_code', file)
    expect(r.messagesInserted).toBeGreaterThanOrEqual(2)
    expect(new MessagesRepo(db).findBySession('S').length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 3: Nightly e2e**

Write to `cli/test/integration/e2e-nightly.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo } from '../../src/db/repository.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { registerAllRules } from '../../src/detection/rules/index.js'
import { runNightlyJobs } from '../../src/scheduler/jobs.js'
import { BatchRunsRepo } from '../../src/db/repository.js'

const tmp = join(tmpdir(), `tokscale-nightly-${Date.now()}.db`)
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

describe('E2E nightly', () => {
  it('runs all nightly jobs without throwing and records batch_runs', async () => {
    const db = getDb(tmp); migrate(db)
    new SessionsRepo(db).upsert({ id: 'old', tool: 'claude_code', model: 'm', startedAt: Date.now() - 100 * 24 * 60 * 60 * 1000 })
    const reg = new RuleRegistry(); registerAllRules(reg)
    await runNightlyJobs(db, reg, 90)
    expect(new BatchRunsRepo(db).lastRunAt('vacuum')).toBeTruthy()
  })
})
```

- [ ] **Step 4: Run + commit**

```bash
cd cli && npx vitest run test/integration
git add test/integration
git commit -m "test(integration): e2e hook + backfill + nightly"
```

---

## Task 7.10: Final verification + HANDOVER + plan-index update

**Files:** modify `cli/HANDOVER.md`

- [ ] **Step 1: Build**

Run: `cd cli && npm run build`

- [ ] **Step 2: Full test suite**

Run: `cd cli && npm run test:run`
Expected: all pass.

- [ ] **Step 3: Lint**

Run: `cd cli && npm run lint`
Expected: clean.

- [ ] **Step 4: Manual smoke of all 8 acceptance criteria (spec §14)**

Perform each of these manually; treat any failure as a blocker:

1. Install hook locally, run Claude Code in the repo, confirm `hook_events` rows appear: `cd cli && ./bin/tokscale.js hook install --local && ./bin/tokscale.js privacy audit`.
2. Open TUI: `./bin/tokscale.js` — verify all 10 tabs navigate with keys 1–0.
3. Run `./bin/tokscale.js rules list` — all 14 rules shown.
4. Acknowledge a detection in TUI (`a`) — verify DB row updated.
5. Trigger `!` overlay; if suggestions exist, apply one; confirm `CLAUDE.md` gained a line.
6. Kick the daemon: `./bin/tokscale.js daemon start --detach` then `./bin/tokscale.js daemon status`; then stop it.
7. Run `./bin/tokscale.js privacy audit` and confirm expected row counts.
8. Run `./bin/tokscale.js rules hard-block C12_runaway_killswitch` — verify subsequent PreToolUse in a session above ceiling returns block decision in e2e test or manual invocation.

- [ ] **Step 5: Update HANDOVER.md**

Append to `cli/HANDOVER.md`:

```
## 4. Proactive insights layer (v0.2)

The CLI now includes a proactive detection engine, Claude Code hook integration, and a polling daemon for non-hook tools. See `docs/superpowers/specs/2026-04-15-proactive-insights-design.md` for the full spec and `docs/superpowers/plans/2026-04-15-proactive-insights-plan*.md` for implementation.

- Storage: SQLite at `~/.config/tokscale/toktracker.db` (WAL). Schema in `src/db/schema.sql`. Access via typed repos in `src/db/repository.ts`.
- Data capture: parsers emit per-message + per-tool-call rows (`src/capture/`); one-time `backfill` ingests history.
- Detection: 14 rules in `src/detection/rules/` (A1–A5, B6–B9, C10–C12, D13–D14). Registered centrally by `registerAllRules`.
- Hook: `tokscale hook install|uninstall|status` writes marker-tagged entries to `.claude/settings.json`; `tokscale hook exec` is called by Claude Code on each hook event and returns a decision.
- Daemon: `tokscale daemon start --detach` runs a poller for non-hook tools and emits OS notifications via `node-notifier`.
- TUI: new tabs 7–0 (Insights, Rules, Attribution, Hooks); overlays `!` (CLAUDE.md suggestions) and `@` (saved command candidates); HUD shows real-time context usage + ETA + today's cost.
- Redaction: plaintext + user-editable regex pipeline; built-in rules ship for AWS/GitHub/OpenAI tokens, private keys, email, phone.
```

- [ ] **Step 6: Commit**

```bash
cd cli && git add HANDOVER.md
git commit -m "docs(cli): add v0.2 proactive insights section to HANDOVER"
```

---

## Phase 7 (and overall plan) verification gate

- [ ] `cd cli && npm run test:run` green
- [ ] `cd cli && npm run lint` green
- [ ] Manual acceptance criteria 1–8 (spec §14) all pass
- [ ] Parent plan `2026-04-15-proactive-insights-plan.md` remains up to date (no further phases required)

Plan complete — the 14-feature proactive insights layer is implemented.
