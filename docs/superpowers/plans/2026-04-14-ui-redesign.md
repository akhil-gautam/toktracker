# tokscale CLI UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the tokscale TUI from slash-command + basic dashboard to tab-based navigation with hero metrics, expandable tables, horizontal bar charts, sparklines, and rich animations.

**Architecture:** Replace CommandInput router with TabBar. Build reusable ExpandableTable and Sparkline components. Add new hooks for tab navigation, list cursor, and scrolling. Extend SessionStore with new aggregation methods.

**Tech Stack:** Existing — Ink 5, React 18, TypeScript, tsup, vitest

---

## File Structure (changes only)

```
cli/src/
├── components/
│   ├── TabBar.tsx              # NEW — tab row + keyboard nav
│   ├── HeroMetrics.tsx         # NEW — giant cost + sparkline + cards
│   ├── ExpandableTable.tsx     # NEW — generic expandable table
│   ├── DailyChart.tsx          # NEW — horizontal bars + sparklines
│   ├── Sparkline.tsx           # NEW — reusable sparkline
│   ├── InfoCard.tsx            # NEW — bordered card
│   ├── StatusBar.tsx           # NEW — contextual keybindings
│   ├── HelpOverlay.tsx         # NEW — help screen on ?
│   ├── OverviewTab.tsx         # NEW — replaces Dashboard
│   ├── ModelsTab.tsx           # NEW — expandable model table
│   ├── DailyTab.tsx            # NEW — horizontal bars view
│   ├── ReposTab.tsx            # NEW — expandable repo table
│   ├── BudgetTab.tsx           # NEW — replaces BudgetView
│   ├── SessionsTab.tsx         # NEW — scrollable sessions
│   ├── BudgetBar.tsx           # KEEP
│   ├── Header.tsx              # KEEP
│   ├── Loading.tsx             # KEEP
│   ├── Dashboard.tsx           # DELETE
│   ├── ModelBreakdown.tsx      # DELETE
│   ├── ToolBreakdown.tsx       # DELETE
│   ├── WeekChart.tsx           # DELETE
│   ├── ModelView.tsx           # DELETE
│   ├── RepoView.tsx            # DELETE
│   ├── TimelineView.tsx        # DELETE
│   ├── SessionList.tsx         # DELETE
│   ├── HelpView.tsx            # DELETE
│   └── CommandInput.tsx        # DELETE
├── hooks/
│   ├── useTabNavigation.ts     # NEW
│   ├── useExpandableList.ts    # NEW
│   ├── useScrollableList.ts    # NEW
│   ├── useSparkline.ts         # NEW
│   ├── useAnimatedValue.ts     # KEEP
│   ├── useBudget.ts            # KEEP
│   └── useSessions.ts          # MODIFY — add new store methods
├── services/
│   └── session-store.ts        # MODIFY — add new aggregation methods
├── app.tsx                     # MODIFY — TabBar router
├── views/
│   └── index.ts                # MODIFY — re-export new tabs
└── theme.ts                    # MODIFY — add sparkline chars
```

---

## Task 1: Extend SessionStore + Theme

**Files:**
- Modify: `cli/src/services/session-store.ts`
- Modify: `cli/src/theme.ts`
- Create: `cli/test/session-store-v2.test.ts`

- [ ] **Step 1: Write new tests for SessionStore**

```typescript
// test/session-store-v2.test.ts
import { describe, it, expect } from 'vitest'
import { SessionStore } from '../src/services/session-store.js'
import type { Session } from '../src/types.js'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'test-' + Math.random().toString(36).slice(2),
    tool: 'claude_code', model: 'claude-sonnet-4-6', provider: 'anthropic',
    inputTokens: 1000, outputTokens: 200, cacheReadTokens: 500,
    cacheWriteTokens: 0, reasoningTokens: 0, costMillicents: 5000,
    startedAt: new Date(), ...overrides,
  }
}

describe('SessionStore v2 methods', () => {
  it('getActiveTools returns tools with sessions today', () => {
    const store = new SessionStore()
    store.addSessions([
      makeSession({ tool: 'claude_code' }),
      makeSession({ tool: 'codex' }),
      makeSession({ tool: 'claude_code' }),
    ])
    const tools = store.getActiveTools()
    expect(tools).toContain('claude_code')
    expect(tools).toContain('codex')
    expect(tools).toHaveLength(2)
  })

  it('getTopRepo returns repo with highest cost today', () => {
    const store = new SessionStore()
    store.addSessions([
      makeSession({ gitRepo: 'user/a', costMillicents: 3000 }),
      makeSession({ gitRepo: 'user/b', costMillicents: 8000 }),
      makeSession({ gitRepo: 'user/a', costMillicents: 2000 }),
    ])
    const top = store.getTopRepo()
    expect(top?.repo).toBe('user/b')
  })

  it('getModelTrends returns per-model 7-day cost arrays', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([
      makeSession({ model: 'claude-opus-4-6', costMillicents: 5000, startedAt: today }),
    ])
    const trends = store.getModelTrends()
    expect(trends['claude-opus-4-6']).toBeDefined()
    expect(trends['claude-opus-4-6'].length).toBe(7)
  })

  it('getDailyStats returns stats for arbitrary day range', () => {
    const store = new SessionStore()
    const today = new Date()
    store.addSessions([makeSession({ costMillicents: 5000, startedAt: today })])
    const stats = store.getDailyStats(14)
    expect(stats.length).toBe(14)
  })

  it('getWeekOverWeekDelta returns percentage change', () => {
    const store = new SessionStore()
    const today = new Date()
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 8)
    store.addSessions([
      makeSession({ costMillicents: 10000, startedAt: today }),
      makeSession({ costMillicents: 5000, startedAt: lastWeek }),
    ])
    const delta = store.getWeekOverWeekDelta()
    // This week: 10000, last week: 5000 → +100%
    expect(delta).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd cli && npx vitest run test/session-store-v2.test.ts`

- [ ] **Step 3: Add new methods to SessionStore**

Add these methods to the existing `SessionStore` class in `src/services/session-store.ts`:

```typescript
getActiveTools(): string[] {
  const tools = new Set<string>()
  for (const s of this.sessions.values()) {
    if (isToday(s.startedAt)) tools.add(s.tool)
  }
  return Array.from(tools)
}

getTopRepo(): RepoStats | undefined {
  const repos = this.getRepoStats()
  // Filter to today only
  const todayRepos = new Map<string, RepoStats>()
  for (const s of this.sessions.values()) {
    if (!isToday(s.startedAt) || !s.gitRepo) continue
    const e = todayRepos.get(s.gitRepo)
    if (e) { e.costMillicents += s.costMillicents; e.sessionCount++ }
    else todayRepos.set(s.gitRepo, { repo: s.gitRepo, costMillicents: s.costMillicents, sessionCount: 1, models: [s.model] })
  }
  return Array.from(todayRepos.values()).sort((a, b) => b.costMillicents - a.costMillicents)[0]
}

getModelTrends(): Record<string, number[]> {
  const trends: Record<string, number[]> = {}
  const models = new Set<string>()
  for (const s of this.sessions.values()) models.add(s.model)
  for (const model of models) {
    const daily: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = dateKey(d)
      let cost = 0
      for (const s of this.sessions.values()) {
        if (s.model === model && dateKey(s.startedAt) === key) cost += s.costMillicents
      }
      daily.push(cost)
    }
    trends[model] = daily
  }
  return trends
}

getDailyStats(days: number): DayStats[] {
  const dayMap = new Map<string, DayStats>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const key = dateKey(d)
    dayMap.set(key, { date: key, costMillicents: 0, inputTokens: 0, outputTokens: 0, sessionCount: 0 })
  }
  const start = daysAgo(days - 1)
  for (const s of this.sessions.values()) {
    if (s.startedAt >= start) {
      const day = dayMap.get(dateKey(s.startedAt))
      if (day) { day.costMillicents += s.costMillicents; day.inputTokens += s.inputTokens; day.outputTokens += s.outputTokens; day.sessionCount++ }
    }
  }
  return Array.from(dayMap.values())
}

getWeekOverWeekDelta(): number {
  const thisWeekStart = daysAgo(6)
  const lastWeekStart = daysAgo(13)
  let thisWeek = 0, lastWeek = 0
  for (const s of this.sessions.values()) {
    if (s.startedAt >= thisWeekStart) thisWeek += s.costMillicents
    else if (s.startedAt >= lastWeekStart) lastWeek += s.costMillicents
  }
  if (lastWeek === 0) return thisWeek > 0 ? 100 : 0
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
}
```

- [ ] **Step 4: Add sparkline chars to theme.ts**

Add to `src/theme.ts`:

```typescript
export const SPARKLINE_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function sparkline(values: number[]): string {
  if (values.length === 0) return ''
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const range = max - min || 1
  return values.map(v => {
    const idx = Math.round(((v - min) / range) * (SPARKLINE_CHARS.length - 1))
    return SPARKLINE_CHARS[idx]
  }).join('')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd cli && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/services/session-store.ts src/theme.ts test/session-store-v2.test.ts
git commit -m "feat(cli): extend session store with trends, deltas, and sparkline util"
```

---

## Task 2: New Hooks — Tab Navigation, Expandable List, Scrollable List, Sparkline

**Files:**
- Create: `cli/src/hooks/useTabNavigation.ts`
- Create: `cli/src/hooks/useExpandableList.ts`
- Create: `cli/src/hooks/useScrollableList.ts`
- Create: `cli/src/hooks/useSparkline.ts`

- [ ] **Step 1: Create useTabNavigation**

```typescript
// src/hooks/useTabNavigation.ts
import { useState, useCallback } from 'react'
import { useInput } from 'ink'

export type TabName = 'overview' | 'models' | 'daily' | 'repos' | 'budget' | 'sessions'

const TABS: TabName[] = ['overview', 'models', 'daily', 'repos', 'budget', 'sessions']
const TAB_LABELS: Record<TabName, string> = {
  overview: 'Overview', models: 'Models', daily: 'Daily',
  repos: 'Repos', budget: 'Budget', sessions: 'Sessions',
}

export { TABS, TAB_LABELS }

export function useTabNavigation(initialTab: TabName = 'overview') {
  const [activeTab, setActiveTab] = useState<TabName>(initialTab)
  const [commandMode, setCommandMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const handleInput = useCallback((input: string, key: any, onQuit: () => void, onCommand?: (cmd: string) => void) => {
    if (showHelp) {
      if (key.escape || input === '?' || input === 'q') setShowHelp(false)
      return
    }

    if (commandMode) {
      if (key.return) {
        if (onCommand) onCommand(commandInput.trim())
        setCommandInput(''); setCommandMode(false); return
      }
      if (key.escape) { setCommandInput(''); setCommandMode(false); return }
      if (key.backspace || key.delete) {
        if (commandInput.length <= 1) { setCommandInput(''); setCommandMode(false) }
        else setCommandInput(commandInput.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) setCommandInput(commandInput + input)
      return
    }

    if (input === '/') { setCommandMode(true); setCommandInput('/'); return }
    if (input === '?') { setShowHelp(true); return }
    if (input === 'q') { onQuit(); return }

    // Number keys 1-6 for tabs
    const num = parseInt(input)
    if (num >= 1 && num <= 6) { setActiveTab(TABS[num - 1]); return }

    // Arrow keys for tab cycling
    if (key.leftArrow) {
      const idx = TABS.indexOf(activeTab)
      setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length])
      return
    }
    if (key.rightArrow) {
      const idx = TABS.indexOf(activeTab)
      setActiveTab(TABS[(idx + 1) % TABS.length])
      return
    }
  }, [activeTab, commandMode, commandInput, showHelp])

  return { activeTab, setActiveTab, commandMode, commandInput, showHelp, setShowHelp, handleInput, TABS, TAB_LABELS }
}
```

- [ ] **Step 2: Create useExpandableList**

```typescript
// src/hooks/useExpandableList.ts
import { useState, useCallback } from 'react'

export type SortKey = string

export function useExpandableList<T>(items: T[], defaultSort?: SortKey) {
  const [cursor, setCursor] = useState(0)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort ?? '')

  const moveUp = useCallback(() => {
    setCursor(prev => Math.max(0, prev - 1))
  }, [])

  const moveDown = useCallback(() => {
    setCursor(prev => Math.min(items.length - 1, prev + 1))
  }, [items.length])

  const toggleExpand = useCallback(() => {
    setExpandedIndex(prev => prev === cursor ? null : cursor)
  }, [cursor])

  const sort = useCallback((key: SortKey) => {
    setSortKey(key)
    setExpandedIndex(null)
    setCursor(0)
  }, [])

  return { cursor, expandedIndex, sortKey, moveUp, moveDown, toggleExpand, sort, setCursor }
}
```

- [ ] **Step 3: Create useScrollableList**

```typescript
// src/hooks/useScrollableList.ts
import { useState, useCallback, useMemo } from 'react'

export function useScrollableList<T>(items: T[], viewportHeight: number = 15) {
  const [scrollOffset, setScrollOffset] = useState(0)
  const [cursor, setCursor] = useState(0)

  const moveUp = useCallback(() => {
    setCursor(prev => {
      const next = Math.max(0, prev - 1)
      if (next < scrollOffset) setScrollOffset(next)
      return next
    })
  }, [scrollOffset])

  const moveDown = useCallback(() => {
    setCursor(prev => {
      const next = Math.min(items.length - 1, prev + 1)
      if (next >= scrollOffset + viewportHeight) setScrollOffset(next - viewportHeight + 1)
      return next
    })
  }, [items.length, scrollOffset, viewportHeight])

  const visibleItems = useMemo(() => {
    return items.slice(scrollOffset, scrollOffset + viewportHeight)
  }, [items, scrollOffset, viewportHeight])

  const visibleStartIndex = scrollOffset

  return { cursor, scrollOffset, visibleItems, visibleStartIndex, moveUp, moveDown }
}
```

- [ ] **Step 4: Create useSparkline**

```typescript
// src/hooks/useSparkline.ts
import { sparkline } from '../theme.js'

export function useSparkline(values: number[]): string {
  return sparkline(values)
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTabNavigation.ts src/hooks/useExpandableList.ts src/hooks/useScrollableList.ts src/hooks/useSparkline.ts
git commit -m "feat(cli): add hooks for tab navigation, expandable lists, scrollable lists"
```

---

## Task 3: Foundation Components — TabBar, Sparkline, InfoCard, StatusBar

**Files:**
- Create: `cli/src/components/TabBar.tsx`
- Create: `cli/src/components/Sparkline.tsx`
- Create: `cli/src/components/InfoCard.tsx`
- Create: `cli/src/components/StatusBar.tsx`
- Create: `cli/src/components/HelpOverlay.tsx`

- [ ] **Step 1: Create TabBar**

```tsx
// src/components/TabBar.tsx
import React from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import type { TabName } from '../hooks/useTabNavigation.js'
import { TABS, TAB_LABELS } from '../hooks/useTabNavigation.js'

interface TabBarProps { activeTab: TabName }

export function TabBar({ activeTab }: TabBarProps) {
  return (
    <Box marginBottom={1}>
      <Gradient name="vice"><Text bold>{'\u25C6 tokscale'}</Text></Gradient>
      <Text color="gray"> {'\u2502'} </Text>
      {TABS.map((tab, i) => (
        <React.Fragment key={tab}>
          {i > 0 && <Text color="gray">  </Text>}
          {tab === activeTab ? (
            <Text color="white" bold underline>{TAB_LABELS[tab]}</Text>
          ) : (
            <Text color="gray">{TAB_LABELS[tab]}</Text>
          )}
        </React.Fragment>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Create Sparkline**

```tsx
// src/components/Sparkline.tsx
import React from 'react'
import { Text } from 'ink'
import { SPARKLINE_CHARS } from '../theme.js'

interface SparklineProps {
  values: number[]
  color?: string
  colorScale?: boolean  // if true, each char colored by value magnitude
}

export function Sparkline({ values, color, colorScale }: SparklineProps) {
  if (values.length === 0) return <Text color="gray">-</Text>

  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const range = max - min || 1

  const chars = values.map(v => {
    const idx = Math.round(((v - min) / range) * (SPARKLINE_CHARS.length - 1))
    return SPARKLINE_CHARS[idx]
  })

  if (!colorScale) {
    return <Text color={color ?? 'cyan'}>{chars.join('')}</Text>
  }

  return (
    <>
      {chars.map((ch, i) => {
        const ratio = (values[i] - min) / range
        const c = ratio < 0.4 ? '#4CAF50' : ratio < 0.7 ? '#FFC107' : '#FF5722'
        return <Text key={i} color={c}>{ch}</Text>
      })}
    </>
  )
}
```

- [ ] **Step 3: Create InfoCard**

```tsx
// src/components/InfoCard.tsx
import React from 'react'
import { Box, Text } from 'ink'

interface InfoCardProps {
  children: React.ReactNode
  borderColor?: string
  width?: number
}

export function InfoCard({ children, borderColor, width }: InfoCardProps) {
  return (
    <Box
      borderStyle="round"
      borderColor={borderColor ?? 'gray'}
      paddingX={1}
      paddingY={0}
      width={width ?? 28}
      flexDirection="column"
    >
      {children}
    </Box>
  )
}
```

- [ ] **Step 4: Create StatusBar**

```tsx
// src/components/StatusBar.tsx
import React from 'react'
import { Box, Text } from 'ink'
import type { TabName } from '../hooks/useTabNavigation.js'

interface StatusBarProps {
  tab: TabName
  commandMode?: boolean
  commandInput?: string
}

const TAB_HINTS: Record<TabName, string> = {
  overview: '? help  q quit  / command  1-6 tabs  \u2190\u2192 switch tab',
  models: '\u2191\u2193 navigate  Enter expand  c/t/s/n sort  ? help  q quit',
  daily: '? help  q quit  1-6 tabs',
  repos: '\u2191\u2193 navigate  Enter expand  ? help  q quit',
  budget: '? help  q quit  /budget set  1-6 tabs',
  sessions: '\u2191\u2193 scroll  ? help  q quit',
}

export function StatusBar({ tab, commandMode, commandInput }: StatusBarProps) {
  if (commandMode) {
    return (
      <Box>
        <Text color="cyan" bold>{'> '}</Text>
        <Text color="white">{commandInput}</Text>
        <Text color="gray">{'\u2588'}</Text>
      </Box>
    )
  }

  return (
    <Box>
      <Text color="gray" dimColor>{TAB_HINTS[tab]}</Text>
    </Box>
  )
}
```

- [ ] **Step 5: Create HelpOverlay**

```tsx
// src/components/HelpOverlay.tsx
import React from 'react'
import { Box, Text } from 'ink'

interface HelpOverlayProps { serverMode: boolean }

const KEYS = [
  { key: '\u2190 \u2192', desc: 'Switch tabs' },
  { key: '1-6', desc: 'Jump to tab' },
  { key: '\u2191 \u2193 / j k', desc: 'Navigate lists' },
  { key: 'Enter', desc: 'Expand/collapse row' },
  { key: 'c t s n', desc: 'Sort (Models/Repos tab)' },
  { key: '/', desc: 'Command mode' },
  { key: '?', desc: 'Toggle this help' },
  { key: 'q', desc: 'Quit' },
]

const COMMANDS = [
  { cmd: '/budget set', desc: 'Create or edit a budget' },
]

const SERVER_COMMANDS = [
  { cmd: '/login', desc: 'Authenticate with server' },
  { cmd: '/push', desc: 'Sync sessions to server' },
  { cmd: '/watch', desc: 'Continuous sync loop' },
]

export function HelpOverlay({ serverMode }: HelpOverlayProps) {
  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Keyboard Shortcuts</Text>
      </Box>
      {KEYS.map(k => (
        <Box key={k.key} gap={2}>
          <Text color="#7C6FE0">{k.key.padEnd(14)}</Text>
          <Text color="gray">{k.desc}</Text>
        </Box>
      ))}
      <Box marginTop={1} marginBottom={1}>
        <Text color="cyan" bold>Commands</Text>
      </Box>
      {COMMANDS.map(c => (
        <Box key={c.cmd} gap={2}>
          <Text color="#E8A838">{c.cmd.padEnd(14)}</Text>
          <Text color="gray">{c.desc}</Text>
        </Box>
      ))}
      {serverMode && (
        <>
          <Box marginTop={1} marginBottom={0}>
            <Text color="gray" dimColor>Server:</Text>
          </Box>
          {SERVER_COMMANDS.map(c => (
            <Box key={c.cmd} gap={2}>
              <Text color="#E8A838">{c.cmd.padEnd(14)}</Text>
              <Text color="gray">{c.desc}</Text>
            </Box>
          ))}
        </>
      )}
      <Box marginTop={1}>
        <Text color="gray">Press </Text><Text color="white">?</Text><Text color="gray"> or </Text><Text color="white">Esc</Text><Text color="gray"> to close</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 6: Verify compilation**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/components/TabBar.tsx src/components/Sparkline.tsx src/components/InfoCard.tsx src/components/StatusBar.tsx src/components/HelpOverlay.tsx
git commit -m "feat(cli): add TabBar, Sparkline, InfoCard, StatusBar, HelpOverlay components"
```

---

## Task 4: OverviewTab (Hero Metrics + Card Grid)

**Files:**
- Create: `cli/src/components/HeroMetrics.tsx`
- Create: `cli/src/components/OverviewTab.tsx`

- [ ] **Step 1: Create HeroMetrics**

```tsx
// src/components/HeroMetrics.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { Sparkline } from './Sparkline.js'
import { InfoCard } from './InfoCard.js'
import { useAnimatedCost } from '../hooks/useAnimatedValue.js'
import { formatCost, budgetColor, BAR_FULL, BAR_EMPTY, TOOL_LABELS } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface HeroMetricsProps {
  store: SessionStore
  budgetResults: BudgetResult[]
}

export function HeroMetrics({ store, budgetResults }: HeroMetricsProps) {
  const today = store.getTodayStats()
  const weekTotal = store.getWeekTotal()
  const weekDelta = store.getWeekOverWeekDelta()
  const activeTools = store.getActiveTools()
  const topRepo = store.getTopRepo()
  const weekStats = store.getWeekStats()
  const weekCosts = weekStats.map(d => d.costMillicents)

  const todayCost = useAnimatedCost(today.costMillicents)
  const topBudget = budgetResults.length > 0 ? budgetResults.sort((a, b) => b.pct - a.pct)[0] : null

  const deltaStr = weekDelta >= 0 ? `\u2191${weekDelta}%` : `\u2193${Math.abs(weekDelta)}%`
  const deltaColor = weekDelta >= 0 ? '#FF5722' : '#4CAF50'

  return (
    <Box flexDirection="column">
      {/* Hero cost */}
      <Box flexDirection="column" marginBottom={1} paddingLeft={6}>
        <Text color="#4CAF50" bold>{todayCost}</Text>
        <Box>
          <Text color="gray">today's spend  </Text>
          <Sparkline values={weekCosts} colorScale />
          <Text color="gray">  7d</Text>
        </Box>
      </Box>

      {/* Info cards - 2x2 grid */}
      <Box marginBottom={1} gap={1}>
        <InfoCard>
          <Text color="#64B5F6" bold>{formatCost(weekTotal)}</Text>
          <Text color="gray"> this week</Text>
          <Text color={deltaColor}>{deltaStr} from last week</Text>
        </InfoCard>
        <InfoCard>
          <Text color="#E8A838" bold>{activeTools.length} tools</Text>
          <Text color="gray"> active</Text>
          <Text color="gray" dimColor>{activeTools.map(t => TOOL_LABELS[t] ?? t).join(', ')}</Text>
        </InfoCard>
      </Box>
      <Box gap={1}>
        {topBudget ? (
          <InfoCard borderColor={topBudget.pct >= 80 ? 'red' : undefined}>
            <Text color={budgetColor(topBudget.pct)} bold>{topBudget.pct}%</Text>
            <Text color="gray"> budget used</Text>
            <Text color="gray" dimColor>{formatCost(topBudget.spentCents * 1000)} / {formatCost(topBudget.budget.limitCents * 1000)}</Text>
          </InfoCard>
        ) : (
          <InfoCard>
            <Text color="gray">No budget set</Text>
            <Text color="gray" dimColor>/budget set to create</Text>
          </InfoCard>
        )}
        {topRepo ? (
          <InfoCard>
            <Text color="#7C6FE0" bold>{topRepo.repo.split('/').pop()}</Text>
            <Text color="gray"> top repo today</Text>
            <Text color="gray" dimColor>{formatCost(topRepo.costMillicents)} across {topRepo.sessionCount} sessions</Text>
          </InfoCard>
        ) : (
          <InfoCard>
            <Text color="gray">No repos tracked</Text>
            <Text color="gray" dimColor>Sessions need git cwd</Text>
          </InfoCard>
        )}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Create OverviewTab**

```tsx
// src/components/OverviewTab.tsx
import React from 'react'
import { Box } from 'ink'
import { HeroMetrics } from './HeroMetrics.js'
import type { SessionStore } from '../services/session-store.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface OverviewTabProps {
  store: SessionStore
  budgetResults: BudgetResult[]
}

export function OverviewTab({ store, budgetResults }: OverviewTabProps) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <HeroMetrics store={store} budgetResults={budgetResults} />
    </Box>
  )
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/HeroMetrics.tsx src/components/OverviewTab.tsx
git commit -m "feat(cli): add Overview tab with hero metrics and info card grid"
```

---

## Task 5: ModelsTab (Expandable Table)

**Files:**
- Create: `cli/src/components/ExpandableTable.tsx`
- Create: `cli/src/components/ModelsTab.tsx`

- [ ] **Step 1: Create ExpandableTable**

```tsx
// src/components/ExpandableTable.tsx
import React from 'react'
import { Box, Text } from 'ink'

interface Column {
  label: string
  width: number
  align?: 'left' | 'right'
}

interface ExpandableTableProps {
  columns: Column[]
  rows: Array<{
    cells: string[]
    color?: string
    expandedContent?: React.ReactNode
  }>
  cursor: number
  expandedIndex: number | null
  sortKey?: string
  sortOptions?: Array<{ key: string; label: string }>
}

export function ExpandableTable({ columns, rows, cursor, expandedIndex, sortKey, sortOptions }: ExpandableTableProps) {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text color="gray">  </Text>
        {columns.map((col, i) => (
          <Text key={i} color="gray" dimColor>
            {col.align === 'right' ? col.label.padStart(col.width) : col.label.padEnd(col.width)}
          </Text>
        ))}
      </Box>
      <Box><Text color="gray" dimColor>  {'─'.repeat(columns.reduce((s, c) => s + c.width, 0) + 2)}</Text></Box>

      {/* Rows */}
      {rows.map((row, idx) => {
        const isExpanded = expandedIndex === idx
        const isCursor = cursor === idx
        const arrow = isExpanded ? '\u25BE' : '\u25B8'
        const bgProps = isCursor ? { backgroundColor: '#1e2a3a' } : {}

        return (
          <React.Fragment key={idx}>
            <Box {...bgProps}>
              <Text color={row.color ?? 'white'}>{isCursor ? '\u25B8' : ' '} {arrow} </Text>
              {row.cells.map((cell, ci) => (
                <Text key={ci} color={ci === 0 ? (row.color ?? 'white') : (ci === 1 ? 'white' : 'gray')} bold={ci === 1}>
                  {columns[ci]?.align === 'right' ? cell.padStart(columns[ci].width) : cell.padEnd(columns[ci].width)}
                </Text>
              ))}
            </Box>
            {isExpanded && row.expandedContent && (
              <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
                <Text color="gray" dimColor>{'│'}</Text>
                {row.expandedContent}
                <Text color="gray" dimColor>{'└' + '─'.repeat(45)}</Text>
              </Box>
            )}
          </React.Fragment>
        )
      })}

      {/* Sort hints */}
      {sortOptions && sortOptions.length > 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>Sort: </Text>
          {sortOptions.map((opt, i) => (
            <React.Fragment key={opt.key}>
              {i > 0 && <Text color="gray" dimColor>  </Text>}
              <Text color={sortKey === opt.key ? 'cyan' : 'gray'} bold={sortKey === opt.key}>
                [{opt.key.charAt(0)}]{opt.label.slice(1)}
              </Text>
            </React.Fragment>
          ))}
        </Box>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Create ModelsTab**

```tsx
// src/components/ModelsTab.tsx
import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { ExpandableTable } from './ExpandableTable.js'
import { Sparkline } from './Sparkline.js'
import { useExpandableList } from '../hooks/useExpandableList.js'
import { formatCost, formatTokens, getModelColor } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'
import type { ModelStats } from '../types.js'

interface ModelsTabProps { store: SessionStore }

export function ModelsTab({ store }: ModelsTabProps) {
  const allModels = store.getModelStats()
  const trends = store.getModelTrends()
  const { cursor, expandedIndex, sortKey, moveUp, moveDown, toggleExpand, sort } = useExpandableList(allModels, 'cost')

  const sorted = useMemo(() => {
    const copy = [...allModels]
    switch (sortKey) {
      case 'cost': return copy.sort((a, b) => b.costMillicents - a.costMillicents)
      case 'tokens': return copy.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
      case 'sessions': return copy.sort((a, b) => b.sessionCount - a.sessionCount)
      case 'name': return copy.sort((a, b) => a.model.localeCompare(b.model))
      default: return copy
    }
  }, [allModels, sortKey])

  const totalCost = allModels.reduce((s, m) => s + m.costMillicents, 0)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
    if (key.return) toggleExpand()
    if (input === 'c') sort('cost')
    if (input === 't') sort('tokens')
    if (input === 's') sort('sessions')
    if (input === 'n') sort('name')
  })

  const columns = [
    { label: 'Model', width: 26 },
    { label: 'Cost', width: 10, align: 'right' as const },
    { label: '%', width: 6, align: 'right' as const },
    { label: 'Sessions', width: 10, align: 'right' as const },
  ]

  const rows = sorted.map(stat => {
    const pct = totalCost > 0 ? Math.round((stat.costMillicents / totalCost) * 100) : 0
    const modelTrend = trends[stat.model] ?? []

    return {
      cells: [
        stat.model.length > 24 ? stat.model.slice(0, 21) + '...' : stat.model,
        formatCost(stat.costMillicents),
        `${pct}%`,
        String(stat.sessionCount),
      ],
      color: getModelColor(stat.model),
      expandedContent: (
        <Box flexDirection="column">
          <Box><Text color="gray" dimColor>{'│'} </Text><Sparkline values={modelTrend} color={getModelColor(stat.model)} /><Text color="gray"> 7d trend</Text></Box>
          <Box><Text color="gray" dimColor>{'│'} In: {formatTokens(stat.inputTokens)}  Out: {formatTokens(stat.outputTokens)}</Text></Box>
        </Box>
      ),
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <ExpandableTable
        columns={columns} rows={rows}
        cursor={cursor} expandedIndex={expandedIndex}
        sortKey={sortKey}
        sortOptions={[
          { key: 'cost', label: 'cost' },
          { key: 'tokens', label: 'tokens' },
          { key: 'sessions', label: 'sessions' },
          { key: 'name', label: 'name' },
        ]}
      />
    </Box>
  )
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/ExpandableTable.tsx src/components/ModelsTab.tsx
git commit -m "feat(cli): add Models tab with expandable table and sort controls"
```

---

## Task 6: DailyTab + ReposTab + BudgetTab + SessionsTab

**Files:**
- Create: `cli/src/components/DailyTab.tsx`
- Create: `cli/src/components/ReposTab.tsx`
- Create: `cli/src/components/BudgetTab.tsx`
- Create: `cli/src/components/SessionsTab.tsx`

- [ ] **Step 1: Create DailyTab**

```tsx
// src/components/DailyTab.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { Sparkline } from './Sparkline.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'
import { formatCost, BAR_FULL, BAR_EMPTY, getModelColor } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function DayRow({ date, cost, maxCost, isToday, isPeak }: {
  date: string; cost: number; maxCost: number; isToday: boolean; isPeak: boolean
}) {
  const barWidth = 26
  const pct = maxCost > 0 ? cost / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 400)
  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))
  const color = pct < 0.4 ? '#4CAF50' : pct < 0.7 ? '#FFC107' : '#FF5722'

  const d = new Date(date + 'T12:00:00')
  const label = `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).padEnd(7)} ${DAY_NAMES[d.getDay()]}`

  return (
    <Box>
      <Text color="gray">{label.padEnd(12)}</Text>
      <Text color={color}>{filled}</Text>
      <Text color="gray">{empty}</Text>
      <Text color="white" bold> {formatCost(cost).padStart(8)}</Text>
      {isPeak && <Text color="#FF5722">  {'\u2190'} peak</Text>}
      {isToday && !isPeak && <Text color="#4CAF50">  today</Text>}
    </Box>
  )
}

interface DailyTabProps { store: SessionStore }

export function DailyTab({ store }: DailyTabProps) {
  const days = store.getDailyStats(7)
  const totalCost = days.reduce((s, d) => s + d.costMillicents, 0)
  const maxCost = Math.max(...days.map(d => d.costMillicents), 1)
  const peakDate = days.reduce((max, d) => d.costMillicents > max.costMillicents ? d : max, days[0])?.date
  const todayStr = new Date().toISOString().slice(0, 10)
  const trends = store.getModelTrends()

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Daily Cost</Text>
        <Text color="gray">{'  '.padEnd(36)}</Text>
        <Text color="gray">Total: </Text><Text color="white" bold>{formatCost(totalCost)}</Text>
      </Box>
      <Box marginBottom={1}><Text color="gray" dimColor>{'─'.repeat(60)}</Text></Box>
      {days.map(day => (
        <DayRow key={day.date} date={day.date} cost={day.costMillicents}
          maxCost={maxCost} isToday={day.date === todayStr} isPeak={day.date === peakDate && day.costMillicents > 0} />
      ))}
      <Box marginTop={1}><Text color="gray" dimColor>{'─'.repeat(60)}</Text></Box>
      <Box marginTop={1} gap={2}>
        <Text color="gray" dimColor>Model trends (7d):</Text>
      </Box>
      <Box gap={3}>
        {Object.entries(trends).slice(0, 4).map(([model, values]) => (
          <Box key={model}>
            <Text color={getModelColor(model)}>{model.split('-').slice(-2).join('-').slice(0, 10).padEnd(10)} </Text>
            <Sparkline values={values} color={getModelColor(model)} />
          </Box>
        ))}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Create ReposTab**

```tsx
// src/components/ReposTab.tsx
import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { ExpandableTable } from './ExpandableTable.js'
import { Sparkline } from './Sparkline.js'
import { useExpandableList } from '../hooks/useExpandableList.js'
import { formatCost } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

interface ReposTabProps { store: SessionStore }

export function ReposTab({ store }: ReposTabProps) {
  const repos = store.getRepoStats()
  const { cursor, expandedIndex, moveUp, moveDown, toggleExpand } = useExpandableList(repos)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
    if (key.return) toggleExpand()
  })

  const columns = [
    { label: 'Repository', width: 28 },
    { label: 'Cost', width: 10, align: 'right' as const },
    { label: 'Sessions', width: 10, align: 'right' as const },
  ]

  const rows = repos.map(stat => ({
    cells: [
      stat.repo.length > 26 ? '...' + stat.repo.slice(-23) : stat.repo,
      formatCost(stat.costMillicents),
      String(stat.sessionCount),
    ],
    color: '#7C6FE0',
    expandedContent: (
      <Box flexDirection="column">
        <Box><Text color="gray" dimColor>{'│'} Models: {stat.models.join(', ')}</Text></Box>
      </Box>
    ),
  }))

  if (repos.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">No repository data. Sessions need a git working directory.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <ExpandableTable columns={columns} rows={rows} cursor={cursor} expandedIndex={expandedIndex} />
    </Box>
  )
}
```

- [ ] **Step 3: Create BudgetTab**

```tsx
// src/components/BudgetTab.tsx
import React from 'react'
import { Box, Text } from 'ink'
import { BudgetBar } from './BudgetBar.js'
import type { BudgetResult } from '../hooks/useBudget.js'

interface BudgetTabProps { results: BudgetResult[] }

export function BudgetTab({ results }: BudgetTabProps) {
  if (results.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}><Text color="cyan" bold>Budgets</Text></Box>
        <Text color="gray">No budgets configured.</Text>
        <Text color="gray" dimColor>Use <Text color="cyan">/budget set</Text> to create one.</Text>
      </Box>
    )
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Budgets</Text></Box>
      {results.map(r => <Box key={r.budget.id} marginBottom={1}><BudgetBar result={r} /></Box>)}
    </Box>
  )
}
```

- [ ] **Step 4: Create SessionsTab**

```tsx
// src/components/SessionsTab.tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useScrollableList } from '../hooks/useScrollableList.js'
import { formatCost, formatTokens, getModelColor, TOOL_LABELS } from '../theme.js'
import type { Session } from '../types.js'

interface SessionsTabProps { sessions: Session[] }

export function SessionsTab({ sessions }: SessionsTabProps) {
  const { cursor, visibleItems, visibleStartIndex, moveUp, moveDown } = useScrollableList(sessions, 15)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
  })

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">No sessions found.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={0}>
        <Text color="gray" dimColor>
          {'  Time'.padEnd(10)}{'Tool'.padEnd(14)}{'Model'.padEnd(26)}{'Tokens'.padEnd(10)}{'Cost'.padStart(8)}
        </Text>
      </Box>
      <Box marginBottom={1}><Text color="gray" dimColor>  {'─'.repeat(68)}</Text></Box>
      {visibleItems.map((s, i) => {
        const globalIdx = visibleStartIndex + i
        const isCursor = globalIdx === cursor
        const time = s.startedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        const toolLabel = (TOOL_LABELS[s.tool] ?? s.tool).padEnd(14)
        const modelName = (s.model.length > 24 ? s.model.slice(0, 21) + '...' : s.model).padEnd(26)
        const tokens = formatTokens(s.inputTokens + s.outputTokens).padEnd(10)

        return (
          <Box key={s.id} backgroundColor={isCursor ? '#1e2a3a' : undefined}>
            <Text color={isCursor ? 'cyan' : 'gray'}>{isCursor ? '\u25B8 ' : '  '}</Text>
            <Text color="gray">{time.padEnd(8)}</Text>
            <Text color="white">{toolLabel}</Text>
            <Text color={getModelColor(s.model)}>{modelName}</Text>
            <Text color="gray">{tokens}</Text>
            <Text color="white" bold>{formatCost(s.costMillicents).padStart(8)}</Text>
            {s.estimated && <Text color="yellow"> ~</Text>}
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text color="gray" dimColor>{sessions.length} sessions  ~ = estimated</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/components/DailyTab.tsx src/components/ReposTab.tsx src/components/BudgetTab.tsx src/components/SessionsTab.tsx
git commit -m "feat(cli): add Daily, Repos, Budget, Sessions tab views"
```

---

## Task 7: Rewire App — Tab Router, Delete Old Components

**Files:**
- Modify: `cli/src/app.tsx` — full rewrite
- Modify: `cli/src/hooks/useSessions.ts` — no changes needed
- Modify: `cli/src/views/index.ts` — update exports
- Delete: old components (Dashboard, CommandInput, HelpView, ModelBreakdown, ToolBreakdown, WeekChart, ModelView, RepoView, TimelineView, SessionList)

- [ ] **Step 1: Rewrite app.tsx**

```tsx
// src/app.tsx
import React from 'react'
import { Box, Text, useInput } from 'ink'
import { Loading } from './components/Loading.js'
import { TabBar } from './components/TabBar.js'
import { StatusBar } from './components/StatusBar.js'
import { HelpOverlay } from './components/HelpOverlay.js'
import { BudgetAlert } from './components/BudgetBar.js'
import { OverviewTab } from './components/OverviewTab.js'
import { ModelsTab } from './components/ModelsTab.js'
import { DailyTab } from './components/DailyTab.js'
import { ReposTab } from './components/ReposTab.js'
import { BudgetTab } from './components/BudgetTab.js'
import { SessionsTab } from './components/SessionsTab.js'
import { useTabNavigation } from './hooks/useTabNavigation.js'
import { useSessions } from './hooks/useSessions.js'

interface AppProps { onExit: () => void }

export function App({ onExit }: AppProps) {
  const { store, budgetResults, loading, error, serverMode } = useSessions()
  const { activeTab, commandMode, commandInput, showHelp, handleInput } = useTabNavigation()

  useInput((input, key) => {
    handleInput(input, key, onExit)
  })

  if (loading) return <Loading />
  if (error) return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="red" bold>Error: {error}</Text>
    </Box>
  )

  if (showHelp) {
    return (
      <Box flexDirection="column">
        <TabBar activeTab={activeTab} />
        <HelpOverlay serverMode={serverMode} />
      </Box>
    )
  }

  const alerts = budgetResults.filter(r => r.alert)

  function renderTab() {
    switch (activeTab) {
      case 'overview': return <OverviewTab store={store} budgetResults={budgetResults} />
      case 'models': return <ModelsTab store={store} />
      case 'daily': return <DailyTab store={store} />
      case 'repos': return <ReposTab store={store} />
      case 'budget': return <BudgetTab results={budgetResults} />
      case 'sessions': return <SessionsTab sessions={store.getRecentSessions(50)} />
    }
  }

  return (
    <Box flexDirection="column">
      <TabBar activeTab={activeTab} />
      {alerts.map(r => <BudgetAlert key={r.budget.id} result={r} />)}
      {renderTab()}
      <Box marginTop={1}>
        <StatusBar tab={activeTab} commandMode={commandMode} commandInput={commandInput} />
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Update views/index.ts**

```typescript
// src/views/index.ts
export { OverviewTab } from '../components/OverviewTab.js'
export { ModelsTab } from '../components/ModelsTab.js'
export { DailyTab } from '../components/DailyTab.js'
export { ReposTab } from '../components/ReposTab.js'
export { BudgetTab } from '../components/BudgetTab.js'
export { SessionsTab } from '../components/SessionsTab.js'
export type { TabName } from '../hooks/useTabNavigation.js'
```

- [ ] **Step 3: Delete old components**

Delete these files:
- `src/components/Dashboard.tsx`
- `src/components/CommandInput.tsx`
- `src/components/HelpView.tsx`
- `src/components/ModelBreakdown.tsx`
- `src/components/ToolBreakdown.tsx`
- `src/components/WeekChart.tsx`
- `src/components/ModelView.tsx`
- `src/components/RepoView.tsx`
- `src/components/TimelineView.tsx`
- `src/components/SessionList.tsx`

- [ ] **Step 4: Verify compilation**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 5: Build**

Run: `cd cli && npx tsup`

- [ ] **Step 6: Run all tests**

Run: `cd cli && npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(cli): rewire app to tab-based navigation, remove old components"
```

---

## Task 8: Integration Test + Polish

- [ ] **Step 1: Run full test suite**

Run: `cd cli && npx vitest run`

- [ ] **Step 2: Type check**

Run: `cd cli && npx tsc --noEmit`

- [ ] **Step 3: Production build**

Run: `cd cli && npx tsup`

- [ ] **Step 4: Smoke test**

Run: `cd cli && node dist/index.js` in a real terminal.

Test:
- Tab bar renders with Overview active
- Arrow keys switch tabs
- Number keys (1-6) jump to tabs
- Hero metrics show on Overview
- Models tab shows expandable table, j/k navigates, Enter expands
- Daily tab shows horizontal bars with sparklines
- Sessions tab scrollable with j/k
- ? shows help overlay
- q quits

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(cli): complete UI redesign v2 — tabs, hero metrics, expandable tables, sparklines"
```
