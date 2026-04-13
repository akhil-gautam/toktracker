# tokscale CLI — Design Spec

## Overview

Ink/Node.js TUI for tracking AI coding tool spend. Works fully offline (local-only mode). Optionally connects to Rails API when logged in (server mode).

Supports: Claude Code, Codex, OpenCode, Gemini CLI.

---

## Architecture

```
tokscale (Ink/Node.js TUI)
├── Core: local-only, no server needed
│   ├── File parsers (Claude Code, Codex, OpenCode, Gemini CLI)
│   ├── Cost calculator (bundled model pricing)
│   ├── Git attribution (.git/config + HEAD)
│   ├── Local state (~/.config/tokscale/)
│   └── Dashboard + / commands
│
└── Server mode: unlocked after login
    ├── Sync (push sessions to API)
    ├── Team/org views
    └── Anomaly feed
```

---

## Session File Locations (hardcoded)

| Tool | Path pattern |
|---|---|
| Claude Code | `~/.claude/projects/**/*.jsonl` |
| Codex | `~/.codex/sessions/*.jsonl` |
| OpenCode | `~/.local/share/opencode/**/*.jsonl` |
| Gemini CLI | `~/.gemini/tmp/*/chats/*.json` |

---

## Local State Directory

```
~/.config/tokscale/
├── state.json          # byte-offset cursors per file
├── budgets.json        # local budget rules
├── pricing.json        # bundled model pricing
└── auth.json           # JWT + server URL (only when logged in)
```

---

## Common Session Type

All parsers output this unified type:

```typescript
interface Session {
  id: string              // hash of file path + byte offset for dedup
  tool: 'claude_code' | 'codex' | 'opencode' | 'gemini_cli'
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costMillicents: number
  cwd?: string
  gitRepo?: string
  gitBranch?: string
  startedAt: Date
  endedAt?: Date
}
```

---

## Cost Calculation

Bundled `pricing.json` with known model prices per million tokens.

```
cost = (inputTokens * inputPrice
      + outputTokens * outputPrice
      + cacheReadTokens * cacheReadPrice
      + cacheWriteTokens * cacheWritePrice) / 1_000_000
```

Cost stored as `costMillicents` (integer, 1/1000 of a cent) to avoid floating point drift.

---

## Default View (`tokscale`)

Summary dashboard. Rendered with Ink. Shows:

1. **Header** — "tokscale" in gradient figlet text, compacts to one-line after 1s
2. **Today + Week totals** — large, color-coded numbers
3. **Model breakdown** — horizontal bars, each model a distinct color
4. **Tool breakdown** — Claude Code / Codex / OpenCode / Gemini side by side
5. **7-day trend** — vertical bar chart with gradient fill
6. **Footer** — `/ commands  •  q quit`

```
 tokscale — Sun Apr 13, 2026

 Today: $14.20          Week: $67.30
 ─────────────────────────────────────
 claude-opus-4-6     $8.20  ██████░░ 58%
 claude-sonnet-4-6   $4.10  ███░░░░░ 29%
 gpt-4.1             $1.90  █░░░░░░░ 13%
 ─────────────────────────────────────
 Claude Code  $10.30 │ Codex  $1.90 │ OpenCode  $2.00
 ─────────────────────────────────────
 7-day trend:
 Mon ████  $8
 Tue ██████  $12
 Wed ███  $6
 Thu █████████  $18
 Fri ████████  $15
 Sat █  $2
 Sun ███████  $14

 / commands  •  q quit
```

---

## `/` Commands — Local Mode

| Command | Description |
|---|---|
| `/repos` | Cost grouped by git repo |
| `/models` | Detailed model breakdown with per-model stats |
| `/budget set` | Set a local budget (daily/weekly/monthly, global/per-repo) |
| `/budget` | Budget status with animated progress bars |
| `/timeline` | Day-by-day cost breakdown |
| `/sessions` | Recent sessions list: cost, tool, repo, duration |
| `/help` | All available commands |

## `/` Commands — Server Mode (shown only when logged in)

| Command | Description |
|---|---|
| `/login` | GitHub OAuth flow → JWT |
| `/push` | One-shot sync to server |
| `/watch` | Continuous sync loop |
| `/team` | Org member cost breakdown |
| `/anomalies` | Recent anomaly alerts |

---

## Server Mode Detection

Check if `~/.config/tokscale/auth.json` exists with a valid (non-expired) JWT. If yes, server commands appear in `/help` and sync features are enabled. If no, everything works locally — no error, no nag.

---

## Visual Design — Colorful, Elegant, Animated

### Color System

- **Primary accent**: cyan/teal gradient
- **Cost numbers**: green (under 50% budget) → yellow (50-80%) → red (80%+)
- **Model colors**: curated palette — each model gets a unique, visually distinct color
- **Tool colors**: distinct muted tones per tool
- **Borders**: rounded box-drawing characters, dimmed color
- **Background**: terminal default (respect dark/light themes)

### Animations

- **Startup**: figlet header renders with gradient, then compacts to single-line after 1s transition
- **Loading**: `ink-spinner` (dots style) while parsing session files
- **Progress bars**: smooth fill animation on render (0% → actual value over 300ms)
- **Budget bars**: color transitions from green → yellow → red as they fill
- **Tab transitions**: content swap on `/` navigation with brief fade
- **Number counters**: cost values count up from $0.00 to actual value on first render

### Dependencies for Visual Polish

- `ink` v5 — core TUI framework
- `ink-gradient` — gradient text rendering
- `ink-big-text` — figlet-style large text
- `ink-spinner` — loading spinners
- `ink-box` — bordered boxes (rounded, bold, double)
- `chalk` — 256-color / truecolor text styling
- `pastel` — Ink component library

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | Ink 5 (React for terminal) |
| Language | TypeScript |
| Bundler | tsup |
| File watching | chokidar (FSEvents on macOS) |
| Styling | chalk, ink-gradient, ink-big-text, ink-spinner, ink-box |
| Git info | Direct .git/config + HEAD reads |
| State | JSON files in ~/.config/tokscale/ |
| Package manager | npm |

---

## File Parsers

Each tool gets its own parser module in `src/parsers/`. Each exports:

```typescript
interface Parser {
  name: string
  globPattern: string        // file discovery pattern
  parse(filePath: string, fromOffset: number): Promise<ParseResult>
}

interface ParseResult {
  sessions: Session[]
  newOffset: number          // byte offset to resume from next time
}
```

Parsers:
- `src/parsers/claude-code.ts`
- `src/parsers/codex.ts`
- `src/parsers/opencode.ts`
- `src/parsers/gemini-cli.ts`

---

## Project Structure

```
cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── src/
│   ├── index.tsx              # entry — CLI arg handling, renders <App />
│   ├── app.tsx                # root Ink component, router for / commands
│   ├── components/
│   │   ├── Dashboard.tsx      # default summary view
│   │   ├── Header.tsx         # animated gradient header
│   │   ├── ModelBreakdown.tsx # model cost bars
│   │   ├── ToolBreakdown.tsx  # per-tool summary
│   │   ├── WeekChart.tsx      # 7-day trend bars
│   │   ├── BudgetBar.tsx      # animated budget progress
│   │   ├── SessionList.tsx    # /sessions view
│   │   ├── RepoView.tsx       # /repos view
│   │   ├── CommandInput.tsx   # / command input handler
│   │   └── Loading.tsx        # spinner component
│   ├── parsers/
│   │   ├── index.ts           # parser registry
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── opencode.ts
│   │   └── gemini-cli.ts
│   ├── services/
│   │   ├── cost-calculator.ts # pricing logic
│   │   ├── git-attribution.ts # extract repo/branch from cwd
│   │   ├── state-manager.ts   # cursor + config persistence
│   │   └── session-store.ts   # in-memory session aggregation
│   ├── hooks/
│   │   ├── useSessions.ts     # load + aggregate sessions
│   │   ├── useBudget.ts       # budget state
│   │   └── useAnimatedValue.ts # number/bar animation hook
│   └── data/
│       └── pricing.json       # bundled model prices
└── bin/
    └── tokscale.js            # shebang entry point
```

---

## Budget System (Local)

Stored in `~/.config/tokscale/budgets.json`:

```json
[
  {
    "id": "uuid",
    "scope": "global",
    "scopeValue": null,
    "period": "daily",
    "limitCents": 5000,
    "alertAtPct": 80
  },
  {
    "id": "uuid",
    "scope": "repo",
    "scopeValue": "akhil/edr-platform",
    "period": "daily",
    "limitCents": 2000,
    "alertAtPct": 80
  }
]
```

Budget check runs on every session load. When threshold crossed, a red bordered alert box renders at top of dashboard.

---

## Git Attribution

Extract repo and branch from session's `cwd`:

1. Walk up from `cwd` to find `.git/` directory
2. Read `.git/config` → parse `[remote "origin"]` url → extract `owner/repo`
3. Read `.git/HEAD` → extract branch name
4. Attach to session record

Falls back gracefully — if no `.git/` found, `gitRepo` and `gitBranch` are undefined.
