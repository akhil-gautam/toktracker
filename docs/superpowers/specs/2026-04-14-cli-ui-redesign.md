# tokscale CLI UI Redesign — Design Spec

## Overview

Redesign the tokscale CLI TUI from slash-command navigation with a basic dashboard to a tab-based interface with hero metrics, expandable tables, horizontal bar charts with sparklines, and rich animations. Match and surpass tokscale's visual quality.

## Navigation: Tab Bar + Slash Commands

**Tab bar** always visible at top row. 6 tabs: `Overview | Models | Daily | Repos | Budget | Sessions`

- Arrow keys (← →) or number keys (1-6) switch tabs
- Active tab: bold + underlined, distinct color
- Inactive tabs: dimmed gray

**Slash commands** for actions (not views):
- `/budget set` — create/edit budget interactively
- `/push` — sync to server (server mode only)
- `/login` — authenticate (server mode only)
- `/watch` — continuous sync (server mode only)

**Other keys:**
- `?` — help overlay (shows all keybindings)
- `q` — quit
- `/` — activate command input mode
- `j/k` or `↑/↓` — navigate within lists/tables
- `Enter` — expand/collapse row in expandable tables
- `Esc` — close overlay / return to default state

## Tab: Overview (Hero Metrics + Card Grid)

Giant today's cost as hero element. Inline sparkline for 7-day trend. 4 info cards in 2x2 grid.

```
◆ tokscale │ Overview  Models  Daily  Repos  Budget  Sessions

        $14.20
        today's spend  ▁▂▃▅▇▂▅  7d trend

  ┌─────────────────────┐  ┌─────────────────────┐
  │ $82.50 this week    │  │ 3 tools active       │
  │ ↑12% from last week │  │ Claude Code, Codex,  │
  │                     │  │ OpenCode             │
  └─────────────────────┘  └─────────────────────┘
  ┌─────────────────────┐  ┌─────────────────────┐
  │ 72% budget used     │  │ 5 repos tracked      │
  │ ████████████░░░░    │  │ top: edr-platform    │
  │ $36 / $50 daily     │  │ $8.20 today          │
  └─────────────────────┘  └─────────────────────┘
```

**Behavior:**
- Hero cost animates from $0 (count-up, ease-out, 600ms)
- Sparkline chars: `▁▂▃▄▅▆▇█` mapped to min-max range, colored green→yellow→red
- Budget card border turns red when >= 80% threshold
- Week-over-week delta shown as ↑/↓ percentage
- Cards show: week total, active tools, budget status, top repo

## Tab: Models (Expandable Table)

Compact table with expand-on-Enter for each model row.

**Collapsed row:** `▸ model-name    $cost    %share    sessions`

**Expanded row adds:**
- 7-day sparkline trend for that model
- Token breakdown: In / Out / Cache Read / Cache Write / Reasoning
- Top repos using that model with cost

**Sorting:** Press `c` (cost), `t` (tokens), `s` (sessions), `n` (name) to re-sort. Current sort indicator shown in header.

**Navigation:** `j/k` or `↑/↓` to move cursor. `Enter` to toggle expand. Only one row expanded at a time.

## Tab: Daily (Horizontal Bars + Model Sparklines)

Each day as a horizontal row with colored progress bar and cost label.

```
  Daily Cost                                      Total: $82.50
  ─────────────────────────────────────────────────────────────
  Apr  8  Mon  ████░░░░░░░░░░░░░░░░░░░░░░   $8.20
  ...
  Apr 14  Sun  ███████░░░░░░░░░░░░░░░░░░░  $14.20  today
  ─────────────────────────────────────────────────────────────
  Model trends (7d):
  opus    ▂▃▃▅▇▁▃   gpt-5.4  ▁▂▃▃▅▁▃   sonnet  ▃▃▂▃▃▂▃
```

**Behavior:**
- Bar color: green (<40% of max), yellow (40-70%), red (>70%)
- Peak day annotated with `← peak`
- Today annotated with `today`
- Bars animate on render (fill left to right, 400ms staggered per row)
- Model sparklines at bottom show per-model 7-day trends

## Tab: Repos (Expandable Table)

Same expandable pattern as Models tab.

**Collapsed:** `▸ owner/repo    $cost    sessions    $today`

**Expanded adds:**
- Model breakdown within that repo
- Branch cost breakdown (top 3 branches)
- 7-day sparkline

## Tab: Budget (Animated Progress Bars)

List of configured budgets with animated progress bars.

```
  Global daily         ████████████████░░░░░░░░░  72%
                       $36.00 / $50.00
```

- Bar colors: green (<50%), yellow (50-80%), red (>=80%)
- Animated fill on render
- Budget alerts render at TOP of every tab when threshold crossed:

```
╔═══════════════════════════════════════════════════╗
║  ⚠  edr-platform: $16.40 / $20.00 daily (82%)   ║
╚═══════════════════════════════════════════════════╝
```

## Tab: Sessions (Scrollable List)

Recent sessions in a table. Scrollable with j/k.

Columns: Time, Tool, Model, Tokens, Cost

`~` suffix marks estimated tokens (Gemini CLI).

## Visual Design

### Startup Animation
1. Gradient "tokscale" in figlet font (BigText), renders for 1.5s
2. Transitions to compact header: `◆ tokscale │ [tabs]`

### Color System
- Model colors: gold (opus), purple (sonnet), teal (haiku), green (gpt-4.1), blue (gpt-5.x), orange (o3/o4), pink (gemini)
- Tool colors: gold (Claude Code), green (Codex), blue (OpenCode), pink (Gemini CLI)
- Cost colors: green (normal), yellow (elevated), red (high/alert)
- Budget bars: green→yellow→red gradient based on percentage
- Sparkline: per-value coloring based on relative magnitude

### Animations
- Hero cost: count-up from $0, ease-out cubic, 600ms
- Progress bars: fill animation, 400ms
- Daily bars: staggered fill, 50ms delay between rows
- Tab switch: instant content swap (no transition — feels snappy)
- Sparkline: characters appear left-to-right, 200ms total

### Status Bar
Bottom row shows contextual keybindings for current tab:
- Overview: `? help  q quit  /command  1-6 tabs`
- Models: `↑↓ navigate  Enter expand  c/t/s/n sort  ? help  q quit`
- Sessions: `↑↓ scroll  ? help  q quit`

## Architecture Changes

### New Components
- `TabBar.tsx` — tab row with active state, keyboard navigation
- `HeroMetrics.tsx` — giant cost + sparkline + info cards
- `ExpandableTable.tsx` — generic expandable table (reused by Models, Repos)
- `DailyChart.tsx` — horizontal bars + model sparklines
- `Sparkline.tsx` — reusable sparkline component
- `InfoCard.tsx` — bordered card with title + content
- `StatusBar.tsx` — contextual keybinding hints
- `HelpOverlay.tsx` — full-screen help overlay on `?`

### Modified Components
- `app.tsx` — replace CommandInput router with TabBar router
- `Dashboard.tsx` → becomes `OverviewTab.tsx`
- `BudgetView.tsx` → becomes `BudgetTab.tsx`

### Removed Components
- `CommandInput.tsx` — replaced by TabBar (slash commands handled differently)
- `ModelBreakdown.tsx` — replaced by ExpandableTable in Models tab
- `ToolBreakdown.tsx` — folded into OverviewTab info cards
- `WeekChart.tsx` — replaced by DailyChart horizontal bars
- `ModelView.tsx` — replaced by Models tab
- `RepoView.tsx` — replaced by Repos tab expandable table
- `TimelineView.tsx` — replaced by Daily tab
- `SessionList.tsx` — replaced by Sessions tab with scroll
- `HelpView.tsx` — replaced by HelpOverlay

### New Hooks
- `useTabNavigation.ts` — tab state, arrow/number key handling
- `useExpandableList.ts` — cursor, expand/collapse, sort state
- `useScrollableList.ts` — j/k scroll with viewport window
- `useSparkline.ts` — compute sparkline chars from number array

### New Service Methods on SessionStore
- `getWeekOverWeekDelta()` — percentage change vs prior week
- `getActiveTools()` — list of tools with sessions today
- `getTopRepo()` — repo with highest cost today
- `getModelTrends()` — per-model 7-day cost arrays for sparklines
- `getDailyStats(days: number)` — arbitrary range daily stats
- `getModelStatsForRepo(repo: string)` — model breakdown within a repo
- `getBranchStats(repo: string)` — branch cost breakdown
