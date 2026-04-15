# tokscale CLI — Handover

A terminal dashboard for tracking AI coding tool spend across Claude Code, Codex, OpenCode, and Gemini CLI.

---

## 1. What This App Is & Problems It Solves

### What it is
`tokscale` is an Ink/Node.js TUI that parses local session files from AI coding tools, calculates costs, and renders a colorful live-updating dashboard. Works fully offline (local-first), with optional server sync planned for team/org features.

### Pain points solved

| Pain | Solution |
|------|----------|
| AI coding tools (Claude Code, Codex, OpenCode, Gemini) each dump sessions to different paths with different formats — no unified view | One parser per tool, unified `Session` type, single dashboard |
| Hard to know how much you're spending per model, per repo, per day | Aggregated stats computed in one pass, cached |
| Cost APIs don't exist for these tools — token counts buried in raw JSONL/SQLite | Bundled pricing table + single-pass calculation = accurate cost |
| No way to see which tools (Read/Grep/Bash/etc.) a model is using heavily | Extracts `tool_use` entries, shows per-model donut/stacked bar |
| Budget overruns discovered too late | Live file watching + budget alerts rendered at top of every tab |
| Context window usage invisible until you hit the limit | Per-model avg/peak context % bars |
| Overwhelming to sift through 80,000+ sessions | Expandable tables with sort (`c`/`t`/`s`/`n`), scrollable lists, drill-down |

---

## 2. Tooling & Stack

### Runtime
- **Node.js 20+** (ESM-only)
- **TypeScript 5.7** (strict mode)

### UI
- **Ink 5** — React for terminals (React 18)
- **ink-gradient** — gradient text (header)
- **ink-big-text** — figlet-style large text
- **ink-spinner** — loading indicator
- **asciichart** — ASCII line charts
- **chalk** — color primitives (imported for future use)

### Parsing & Data
- **chokidar** — FSEvents-backed file watcher (live updates)
- **better-sqlite3** — reads OpenCode's SQLite DB
- **glob** — file discovery

### Build & Dev
- **tsup** — ESM bundler (outputs single `dist/index.js`)
- **vitest** — unit tests (9 test files, 62 tests)
- **ink-testing-library** — component test helpers

### Commands
```bash
npm install            # first-time setup
npm run build          # production bundle → dist/
npm test               # watch tests
npm run test:run       # single-pass tests
npm run lint           # tsc --noEmit
node dist/index.js     # run TUI
```

---

## 3. Features & File Map

### Entry points
- `src/index.tsx` — renders `<App />`, clears screen, handles exit
- `bin/tokscale.js` — npm bin shim
- `src/app.tsx` — root router: loading state, TabBar, budget alerts, active tab, StatusBar

### Navigation & Keys
- **Tabs**: Overview · Models · Daily · Repos · Budget · Sessions (arrow keys / 1–6)
- **`?`**: help overlay · **`q`**: quit · **`/`**: command mode (budget actions)
- Per-tab: `j/k` or arrows navigate, `Enter` expand, `c/t/s/n` sort

| File | Responsibility |
|---|---|
| `src/components/TabBar.tsx` | Top tab bar with active state |
| `src/components/StatusBar.tsx` | Contextual keybinding hints at bottom |
| `src/components/HelpOverlay.tsx` | Full help screen on `?` |
| `src/hooks/useTabNavigation.ts` | Tab state + keyboard handling + `/` command mode |

### Data Pipeline (load → parse → aggregate → render)

| File | Responsibility |
|---|---|
| `src/parsers/index.ts` | Registry + parallel batch file loading + live file watching via chokidar + git attribution (cwd-cached) |
| `src/parsers/claude-code.ts` | Parses `~/.claude/projects/**/*.jsonl` — extracts assistant messages with `usage` + `tool_use` calls |
| `src/parsers/codex.ts` | Parses `~/.codex/sessions/**/*.jsonl` — tracks `session_meta`, `turn_context`, `event_msg` |
| `src/parsers/opencode.ts` | Reads `~/.local/share/opencode/opencode.db` SQLite with timestamp cursor |
| `src/parsers/gemini-cli.ts` | Parses `~/.gemini/tmp/*/chats/*.json` — estimates tokens from text length |
| `src/services/cost-calculator.ts` | Model pricing lookup → millicents (fuzzy model name match) |
| `src/services/git-attribution.ts` | Walks up from cwd, reads `.git/config` + HEAD for repo/branch |
| `src/services/state-manager.ts` | Persists cursors + budgets in `~/.config/tokscale/` |
| `src/services/session-store.ts` | Single-pass cache: today/week/all-time aggregations, per-model detail, tool usage, repo breakdown |
| `src/data/pricing.json` | 14 models × input/output/cache pricing per million tokens |
| `src/data/context-windows.ts` | Per-model context window sizes for % usage bars |
| `src/hooks/useSessions.ts` | Initial full-scan load + chokidar live watch for realtime updates |

### Tabs & Views

| File | What it shows |
|---|---|
| `src/components/OverviewTab.tsx` | Hero today cost + 8 stat cards + today detail |
| `src/components/HeroMetrics.tsx` | Giant cost number + sparkline + 8 info cards (all-time, sessions, output tokens, cache reuse, this week, input tokens, active days, avg/session or top budget) |
| `src/components/StatCard.tsx` | Individual stat card with dark bg fill, label, value, delta pill |
| `src/components/TodayDetail.tsx` | Below hero: token summary, hourly activity sparkline (24h), today's models/tools/repos breakdown |
| `src/components/ModelsTab.tsx` | Expandable table of all models, sortable by cost/tokens/sessions/name |
| `src/components/ModelDetail.tsx` | 2-column Linear-style expanded view with left accent bar: (L) 30-day trend + tokens + context % + efficiency, (R) tool usage + CLI distribution + top repos |
| `src/components/DailyTab.tsx` | 30-day line chart + 15-day horizontal bars + per-model sparklines |
| `src/components/ReposTab.tsx` | Expandable repo table with drill-down |
| `src/components/BudgetTab.tsx` | List of configured budgets with animated progress bars |
| `src/components/SessionsTab.tsx` | Scrollable recent sessions list |

### Shared UI Primitives

| File | Purpose |
|---|---|
| `src/components/ExpandableTable.tsx` | Generic table with cursor highlight, expand/collapse rows, sort footer |
| `src/components/LineChart.tsx` | asciichart wrapper with x-stretch and non-overlapping labels |
| `src/components/Sparkline.tsx` | Unicode block-char mini trend line, supports color-scale |
| `src/components/Donut.tsx` | Ellipse donut + StackedBar + 2-col legend |
| `src/components/InfoCard.tsx` | Bordered card (legacy, kept for flexibility) |
| `src/components/BudgetBar.tsx` | Animated progress bar + BudgetAlert red banner |
| `src/components/Loading.tsx` | Centered spinner during initial parse |
| `src/hooks/useAnimatedValue.ts` | Ease-out cubic value animation for numbers + cost format |
| `src/hooks/useBudget.ts` | Budget spend calculation + alert threshold check |
| `src/hooks/useExpandableList.ts` | Cursor + expand/collapse + sort state |
| `src/hooks/useScrollableList.ts` | Viewport window + cursor for long lists |
| `src/hooks/useSparkline.ts` | Thin wrapper over theme.sparkline |
| `src/theme.ts` | Model colors, tool colors, formatters, sparkline chars, bar chars |
| `src/types.ts` | All shared TypeScript interfaces (Session, stats shapes) |

### Tests (`test/`)
Unit tests for all services + parsers + budget logic. Parsers have fixture files under `src/parsers/__fixtures__/`. Run with `npm test`.

### Local State (runtime)
```
~/.config/tokscale/
├── state.json     # per-file cursors (byte offsets / timestamps)
├── budgets.json   # user-configured budgets
└── auth.json      # JWT if logged in (server mode — not yet implemented)
```

---

## Storage (new)

Phase 1 of the proactive-insights feature introduced a SQLite-backed storage layer alongside the existing JSON files.

### SQLite database
- **Path**: `~/.config/tokscale/toktracker.db` (resolved via `src/db/paths.ts`, XDG_CONFIG_HOME-aware)
- **Schema**: `src/db/schema.sql` — 11 tables: `sessions`, `messages`, `tool_calls`, `hook_events`, `git_events`, `detections`, `redaction_rules`, `feature_flags`, `pr_attributions`, `batch_runs`, `schema_version`
- **Connection**: `src/db/connection.ts` — WAL mode singleton with `busy_timeout=5000`
- **Migrations**: `src/db/migrate.ts` — idempotent, reads `schema.sql` at runtime, version-tracked in `schema_version`; also imports legacy `budgets.json` / `state.json` into `feature_flags`
- **Boot**: `src/db/boot.ts` — single call `bootDb(path?)` that opens DB, runs migrations, and seeds builtin redaction rules

### Repositories (`src/db/repository.ts`)
Typed wrappers for each table: `SessionsRepo`, `MessagesRepo`, `ToolCallsRepo`, `HookEventsRepo`, `GitEventsRepo`, `DetectionsRepo`, `FeatureFlagsRepo`, `PrAttributionsRepo`, `BatchRunsRepo`.

### Redaction (`src/redaction/`)
- `builtins.ts` — 8 builtin regex patterns (AWS keys, GitHub tokens, OpenAI keys, Slack tokens, private keys, emails, phone numbers)
- `pipeline.ts` — `Redactor` class: compiles enabled rules into `RegExp`, applies in order
- `repository.ts` — `RedactionRulesRepo`: seeds builtins, CRUD for custom rules

### Retention
- `src/db/retention.ts` — `purge(db, retentionDays)` deletes old `messages`, `tool_calls`, `hook_events` rows (sessions are kept forever for cost attribution)

---

## Data Capture (new)

Phase 2 of the proactive-insights feature added message/tool-call capture, extended parsers, and a git event worker.

### Capture layer (`src/capture/`)
- `hashing.ts` — `sha256`, `normalizeArgs` (canonical JSON with sorted keys), `extractTargetPath` (tool → file path)
- `message-recorder.ts` — `MessageRecorder`: redacts content via `Redactor`, hashes, persists to `messages` + `tool_calls` tables
- `backfill.ts` — `backfill(db, tool, path)`: one-time history import; parses a file with `parseFileExtended`, runs all inserts in a single transaction

### Extended parsers
Each parser now exports both the original `parse*` function (unchanged) and a new `parse*Extended` counterpart that returns `ExtendedParseResult` (adds `messages: ParsedMessage[]` and `toolCalls: ParsedToolCall[]`):
- `src/parsers/claude-code.ts` → `parseClaudeCodeExtended`
- `src/parsers/codex.ts` → `parseCodexExtended`
- `src/parsers/opencode.ts` → `parseOpencodeExtended`
- `src/parsers/gemini-cli.ts` → `parseGeminiExtended`
- `src/parsers/index.ts` → `parseFileExtended(tool, path, fromOffset)` dispatcher

Fixtures for extended parser tests live under `src/parsers/__fixtures__/{claude-code,codex,gemini,opencode}/`.
The opencode fixture uses a fabricated schema (`messages` + `tool_calls` tables) separate from the real opencode schema.

### Git event worker (`src/git/`)
- `event-worker.ts` — `GitEventWorker`: `pollRepo(repo)` calls `gh pr list` and upserts `pr_merged` events; `pollCommits(repo, cwd)` calls `git log` and upserts `commit` events. Both are dedup-safe (SQLite `INSERT OR IGNORE`). Both accept injectable runners for testing.

---

## Detection engine (new)

Phase 3 of the proactive-insights feature built the detection engine core — rule registry, threshold system, runner, session-state cache, context builder, and hint formatter registry.

### `src/detection/`

| File | Role |
|---|---|
| `types.ts` | Core TypeScript interfaces: `Trigger`, `Category`, `Severity`, `Detection`, `DetectionContext`, `Rule`, `HookDecision` |
| `registry.ts` | `RuleRegistry` — stores `Rule` objects, look up by trigger or category, throws on duplicate registration |
| `thresholds.ts` | `ThresholdLoader` — merges per-rule `defaultThresholds` with overrides from `feature_flags` table; returns `ResolvedThresholds` with `enabled`, `hardBlock`, `thresholds` |
| `runner.ts` | `DetectionRunner` — iterates rules for a trigger, applies 200 ms budget cap per rule, writes detections to DB via `DetectionsRepo`, aggregates severities into a `HookDecision` (block/warn/info) |
| `context-builder.ts` | `buildHookContext(db, payload)` — maps a raw hook JSON payload (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`) to a typed `DetectionContext` |
| `hints/formatters.ts` | `formatHint(detection)` — formatter registry; falls back to `[ruleId] summary` when no custom formatter is registered |

### `src/capture/session-state.ts`

`SessionStateCache` — in-process per-session tallies (tool-call arg counts, cumulative token sums, failed-call counts, turn index). Used by rules that need live session state without hitting the DB. Singleton exported as `sessionStateCache`.

---

## Hook (new)

Phase 4 of the proactive-insights feature ships the hook infrastructure: settings mutation, log rotation, exec entry point, schema compat check, and CLI commands.

### `src/hook/`

| File | Role |
|---|---|
| `install.ts` | `installHook(path, cmd)` / `uninstallHook(path)` / `hookStatus(path)` — reads/writes Claude Code `settings.json`, uses `__tokscale_managed__` marker for idempotent, diff-safe mutations; backs up original to `.tokscale-bak` |
| `log.ts` | `HookLogger` — appends ISO-timestamp lines to a log file; rotates to `.1` when `maxBytes` is exceeded |
| `exec.ts` | `runHookExec(args)` — validates hook kind, builds `DetectionContext`, runs `DetectionRunner`, persists `hook_events` row, returns `HookDecision`; also exports `readStdinJson()` and `emit()` for the CLI binary |
| `schema-version.ts` | `supportsPayload(payload)` — checks that required fields (`hook_event_name`) are present; forward-compatible (extra fields are OK) |

### `src/cli/`

| File | Role |
|---|---|
| `hook-commands.ts` | `registerHookCommands(program, deps)` — registers `hook install/uninstall/status/exec` subcommands on a `commander` `Command`; accepts injectable `resolveSettingsPath` and `hookBinary` for testing |
| `index.ts` | CLI entry point (`src/cli/index.ts`) compiled to `dist/cli.js`; wire-up point for all subcommands |

### `src/detection/rules/index.ts`
`registerAllRules(registry)` — registers all 14 rules (A1–A5, B6–B9, C10–C12, D13–D14).

### Rules (A+C)

| File | Rule | Trigger | Description |
|---|---|---|---|
| `src/detection/rules/a1-redundant-tool-call.ts` | A1 | PreToolUse | Warns when the same tool+args already succeeded this session |
| `src/detection/rules/a2-context-bloat.ts` | A2 | UserPromptSubmit | Warns when last N assistant turns exceed token ceiling (suggests /compact) |
| `src/detection/rules/a3-cache-miss-postmortem.ts` | A3 | PostToolUse, Stop | Info when session cache ratio drops significantly vs baseline sessions |
| `src/detection/rules/a4-model-mismatch.ts` | A4 | Stop, UserPromptSubmit | Warns when premium model is dominated by trivial tool calls (suggests Sonnet) |
| `src/detection/rules/a5-retry-failure-waste.ts` | A5 | PostToolUse, Stop | Warns when many failed tool calls have consumed significant tokens |
| `src/detection/rules/c10-context-window-eta.ts` | C10 | UserPromptSubmit | Warns when projected turns until context window exhaustion <= threshold |
| `src/detection/rules/c11-preflight-cost.ts` | C11 | UserPromptSubmit | Info with estimated cost range for the upcoming turn |
| `src/detection/rules/c12-runaway-killswitch.ts` | C12 | PreToolUse | Block when session cost exceeds configured ceiling |

---

## Rules + batch (new)

Phase 6 of the proactive-insights feature adds Category B (cross-session pattern) and D (attribution/waste) rules, an embedding loader with hash fallback, a PR correlator, and a nightly scheduler.

### Embedding layer (`src/embeddings/`)

| File | Role |
|---|---|
| `similarity.ts` | `cosine(a, b)` — dot-product cosine similarity for float vectors |
| `fallback.ts` | `hashSimilarity(a, b)` — Jaccard similarity on 3-char+ token sets; used when the ML model is unavailable |
| `loader.ts` | `getEmbedder()` — lazy-init `@xenova/transformers` pipeline (`Xenova/all-MiniLM-L6-v2`), caches model in `~/.config/tokscale/models/`; falls back to `hashSimilarity` on error. `similarity(a, b)` — top-level entry point |

### PR correlator (`src/git/pr-correlator.ts`)

`correlatePrToSessions(db, repo, prNumber)` — links merged PR events to sessions by branch name (confidence 0.95) and commit SHA (confidence 0.8). Inserts rows into `pr_attributions` table.

### Rules (B + D)

| File | Rule | Trigger | Description |
|---|---|---|---|
| `src/detection/rules/b6-repeat-question.ts` | B6 | UserPromptSubmit, Nightly | Info when the same question hash appears ≥ N times in last 90 days — suggests adding answer to CLAUDE.md |
| `src/detection/rules/b7-correction-graph.ts` | B7 | Stop, PostToolUse | Info when the last user message in the session matches correction phrases (e.g. "no don't use mocks") — candidate for CLAUDE.md rule |
| `src/detection/rules/b8-file-reopen.ts` | B8 | PostToolUse | Info when the same file has been opened via Read/Write/Edit/etc. in ≥ N distinct sessions — suggests adding to CLAUDE.md |
| `src/detection/rules/b9-prompt-pattern.ts` | B9 | Stop, Nightly | Info when a 5-token normalised prefix appears ≥ N times across recent prompts — suggests saving as slash command |
| `src/detection/rules/d13-cost-per-pr.ts` | D13 | GitEvent, Nightly | Info: summarises attributed cost for the most-recently merged PR across its correlated sessions |
| `src/detection/rules/d14-abandoned-session.ts` | D14 | Nightly | Info: flags sessions older than `min_age_days` with no PR/commit events and cost > threshold, reports total waste |

### Nightly scheduler (`src/scheduler/`)

| File | Role |
|---|---|
| `jobs.ts` | `runNightlyJobs(db, registry)` — runs all Nightly-trigger rules via `DetectionRunner`, then calls `purge()`, marks job results in `batch_runs` (keys: `b6_clustering`, `b7_correction_clustering`, `b9_pattern_mining`, `d14_abandoned`, `vacuum`) |
| `cron.ts` | `maybeRunNightly(db, registry)` — checks `batch_runs` anchor, runs nightly jobs at most once per 24 h, updates `nightly_anchor` |

### Hook install paths
- **Local** (default `--local`): `./.claude/settings.json` (relative to `cwd`)
- **Global** (`--global`): `~/.claude/settings.json`

### Binary dispatch (`bin/tokscale.js`)
If `argv[2]` is a non-flag word, loads `dist/cli.js` (subcommand mode); otherwise loads `dist/index.js` (TUI mode).

### Usage
```bash
tokscale hook install --local     # write entries to ./.claude/settings.json
tokscale hook status --local      # print JSON { installed, kinds }
tokscale hook uninstall --local   # remove tokscale entries
# Claude Code invokes automatically:
echo '{"hook_event_name":"PreToolUse"}' | tokscale hook exec PreToolUse
```

---

## Performance Notes

- **Initial load**: full-scans ~1,500+ JSONL files + OpenCode SQLite. ~3–5s on 80k+ sessions thanks to parallel batches of 50 files, pre-filter by string match before JSON.parse, and git attribution cached by cwd.
- **Tab switches**: instant. All stats computed once in a single pass when sessions load, cached in `SessionStore`. Invalidated only on `addSessions()` from live watcher.
- **Live updates**: chokidar watches tool directories, only re-parses the one changed file from its last cursor. Sub-second cost ticks in realtime as LLMs generate tokens.
