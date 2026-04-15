# Proactive Insights — Design Spec

Status: Draft · Date: 2026-04-15 · Scope: toktracker CLI v2 (proactive intelligence layer)

---

## 1. Summary

Extend toktracker from a retrospective spend dashboard into a proactive coding-agent intelligence layer. Ship 14 novel detections across four categories (proactive waste prevention, cross-session pattern mining, predictive guardrails, ROI attribution) delivered via: (a) existing Ink TUI with new tabs, and (b) Claude Code hook integration that can inject hints or hard-block redundant work inline. Other AI coding tools (Codex, OpenCode, Gemini CLI) are supported through a polling daemon that surfaces detections as OS notifications until those tools add hook APIs.

Nothing in this spec duplicates existing commercial or open-source AI-spend tooling (tokscale, ccusage, Anthropic admin console, litellm). The novel levers are: in-context hint injection back into the coding agent; per-message + per-tool-call capture enabling pattern detection; outcome attribution via PR correlation.

---

## 2. Goals

- Reduce token spend by surfacing waste proactively during sessions, not only after
- Warn users (and the agent itself) about predictable failure modes (context bloat, wrong model for task, redundant tool calls, runaway spend)
- Track session → PR → merge outcomes to answer "what did this work cost"
- Mine recurring patterns across sessions into actionable CLAUDE.md / slash-command suggestions
- Preserve privacy via plaintext + user-editable redaction (no content ever leaves the machine in v1)

---

## 3. Non-goals (v1)

- Server sync, team/org mode (separate workstream already speced)
- macOS menu bar app integration
- Web dashboard
- Native hooks for Codex/OpenCode/Gemini (polling fallback only)
- Content encryption at rest (documented as v2 upgrade path)

---

## 4. Architecture

Five subsystems sharing a single SQLite store.

```
┌────────────────────────────────────────────────────────────────┐
│                    toktracker (single binary)                   │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────────┐  │
│  │  TUI (Ink)   │    │ Hook exec   │    │ Daemon (watch)   │  │
│  │  existing +  │    │ stdin JSON  │    │ chokidar + poll  │  │
│  │  new tabs    │    │ stdout JSON │    │ for non-hook     │  │
│  └──────┬───────┘    └──────┬──────┘    │     tools        │  │
│         │                   │           └─────────┬────────┘  │
│         │                   ▼                     │           │
│         │          ┌─────────────────┐            │           │
│         │          │ Detection       │◀───────────┘           │
│         │          │ engine          │                        │
│         │          │ (A/B/C/D rules) │                        │
│         │          └────────┬────────┘                        │
│         ▼                   ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐│
│  │   SQLite (~/.config/tokscale/toktracker.db)              ││
│  │   sessions · messages · tool_calls · hook_events ·       ││
│  │   git_events · detections · redaction_rules ·            ││
│  │   feature_flags · pr_attributions                        ││
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌─────────────────────────┐    ┌─────────────────────────┐  │
│  │ Redaction pipeline      │    │ Git correlation worker  │  │
│  │ applied on all writes   │    │ gh CLI + git log polling│  │
│  └─────────────────────────┘    └─────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 4.1 Subsystem responsibilities

| Subsystem | Responsibility | Boundaries |
|---|---|---|
| TUI | Render dashboards, rule management, overlays; no detection logic | Reads DB only; never writes detections |
| Hook exec (`tokscale hook exec <kind>`) | Short-lived per-invocation process; persists event, runs detectors, emits Claude Code hook response | <50ms p95, 200ms hard cap |
| Daemon (`tokscale daemon`) | Long-running watcher for non-hook tools; emits synthetic triggers into detection engine | OS notification output only for non-hook tools |
| Detection engine | Pure-function rule registry; consumes `DetectionContext`, emits `Detection` rows | No I/O except DB writes via shared layer |
| Redaction pipeline | Applies ordered regex rules on every write of content fields | Pure string transform |
| Git correlation worker | Polls `gh pr list` + `git log`; populates `git_events`; runs PR attribution | Only process invoked during daemon or nightly batch |

### 4.2 Data flow — hook path (Claude Code)

1. Claude Code fires `PreToolUse` / `PostToolUse` / `UserPromptSubmit` / `Stop`
2. `tokscale hook exec <kind>` reads JSON payload from stdin
3. Redaction pipeline scrubs content; row written to `hook_events`
4. Detection runner resolves rules matching trigger, evaluates each
5. Aggregator selects highest severity (block > warn > info); dedups by `rule_id + args_hash`
6. Stdout emits Claude Code hook response (`decision`, `reason`, `additionalContext`)
7. If latency would exceed budget → queue detector for async run, emit empty response

### 4.3 Data flow — polling path (Codex/OpenCode/Gemini)

1. Daemon chokidar fires on JSONL/SQLite change
2. Only new bytes / rows parsed (existing cursor logic retained)
3. Synthetic trigger constructed → detection engine
4. On severity ≥ warn: `node-notifier` fires OS notification (agent context cannot be reached)
5. Detection row persisted for TUI

---

## 5. Data model (SQLite, WAL mode)

```sql
CREATE TABLE sessions (
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
CREATE INDEX idx_sessions_started ON sessions(started_at);
CREATE INDEX idx_sessions_repo ON sessions(git_repo, started_at);

CREATE TABLE messages (
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
CREATE INDEX idx_messages_session ON messages(session_id, turn_index);
CREATE INDEX idx_messages_hash ON messages(content_hash);

CREATE TABLE tool_calls (
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
CREATE INDEX idx_tool_calls_session_args ON tool_calls(session_id, tool_name, args_hash);
CREATE INDEX idx_tool_calls_path ON tool_calls(target_path);

CREATE TABLE hook_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT,
  hook_kind       TEXT NOT NULL,
  payload_json    TEXT NOT NULL,
  decision        TEXT,
  reason          TEXT,
  latency_ms      INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_hook_events_session ON hook_events(session_id, created_at);

CREATE TABLE git_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo            TEXT NOT NULL,
  kind            TEXT NOT NULL,
  sha             TEXT,
  pr_number       INTEGER,
  branch          TEXT,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_git_events_dedup ON git_events(repo, kind, COALESCE(sha,''), COALESCE(pr_number,0));

CREATE TABLE detections (
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
CREATE INDEX idx_detections_rule ON detections(rule_id, created_at);
CREATE INDEX idx_detections_session ON detections(session_id);

CREATE TABLE redaction_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern         TEXT NOT NULL,
  replacement     TEXT NOT NULL DEFAULT '[REDACTED]',
  enabled         INTEGER NOT NULL DEFAULT 1,
  builtin         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

CREATE TABLE feature_flags (
  key             TEXT PRIMARY KEY,
  enabled         INTEGER NOT NULL DEFAULT 0,
  config_json     TEXT
);

CREATE TABLE pr_attributions (
  pr_number       INTEGER NOT NULL,
  repo            TEXT NOT NULL,
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  overlap_kind    TEXT NOT NULL,
  confidence      REAL NOT NULL,
  PRIMARY KEY (pr_number, repo, session_id)
);
```

**Migration from current state:** one-shot importer on first run reads legacy `~/.config/tokscale/state.json` + `budgets.json` → SQLite. Legacy files kept as fallback until next release.

**Retention:** `retention_days` config (default 90). Nightly vacuum deletes `messages`, `tool_calls`, `hook_events` older than threshold. `sessions` and `detections` summaries kept indefinitely.

**Volume estimate:** heavy user ≈ 50 sessions/day × 40 messages × 15 tool_calls ≈ 30k rows/day. 90 days ≈ 2.7M rows. SQLite handles comfortably with indexes. Disk: ~200–500 MB with content capture, ~20–50 MB with hashes only.

---

## 6. Detection rules catalog

Each rule implements:

```ts
interface Rule {
  id: string;
  category: 'A' | 'B' | 'C' | 'D';
  triggers: Trigger[];
  defaultSeverity: 'info' | 'warn' | 'block';
  hardBlockEligible: boolean;
  threshold: Record<string, number>;
  evaluate(ctx: DetectionContext): Detection | null;
  suggestedAction?(d: Detection): Action;
}
```

### 6.1 Category A — Proactive waste (live hook-time)

| ID | Name | Trigger | Logic | Hint text | Block eligible |
|---|---|---|---|---|---|
| A1 | Redundant tool call | PreToolUse | Same `tool_name + args_hash` already succeeded this session | "File X already Read this turn (result in turn 3). Reuse it." | ✅ |
| A2 | Context bloat | UserPromptSubmit | Last N assistant turns added >threshold tokens with <10% referenced in subsequent turns | "Last 5 turns added 42k tokens, most unused. `/compact` saves ~$X." | ❌ |
| A3 | Cache-miss postmortem | PostToolUse / Stop | Cache hit rate < baseline − stdev; diff prompt-prefix vs. prior session to identify break point | "Cache dropped from 78% → 12% at turn 4. Likely cause: system prompt changed." | ❌ |
| A4 | Model mismatch | Stop (retro) + UserPromptSubmit (predictive) | Session complexity score below low-threshold on premium model; classifier = heuristic on tool-call mix + prompt length | "Session was 92% trivial edits on Opus. Sonnet: est. $X (5× cheaper)." | ✅ (pre-send) |
| A5 | Retry / failure waste | PostToolUse | Rolling failed-call count or malformed-JSON count > threshold | "Spent 4.2k tokens on 7 failed Bash calls this session." | ❌ |

### 6.2 Category B — Pattern mining (cross-session batch)

| ID | Name | Trigger | Logic |
|---|---|---|---|
| B6 | Repeat question | UserPromptSubmit + nightly | Content-hash exact match OR embedding similarity ≥ 0.85 (xenova/all-MiniLM ONNX, local) vs. last 90 days; ≥3 matches → surface prior answer |
| B7 | Correction graph | PostToolUse / Stop | Regex on user turns matching correction patterns ("no don't", "stop", "instead", "actually"); cluster → CLAUDE.md candidates |
| B8 | File-reopen tracker | PostToolUse | Distinct sessions reading file X ≥ 5 within 14 days → suggest CLAUDE.md entry or seed prompt |
| B9 | Prompt-pattern extractor | Stop (batch) | n-gram / template mining on user turns; recurring shells (≥5 occurrences, >20 tokens) → save-as-command candidate |

### 6.3 Category C — Predictive guardrails (live)

| ID | Name | Trigger | Logic | Hint / Block |
|---|---|---|---|---|
| C10 | Context-window ETA | UserPromptSubmit | Linear extrapolation: avg tokens/turn × turns to context limit; warn at ETA ≤ N | "Current pace → 200k context in ~6 turns. Compact now: $0.40. Continue: ~$2.80." |
| C11 | Pre-flight cost estimate | UserPromptSubmit | Context size + avg tool-call expansion + expected output from historical distribution by tool+model | "Est. cost this turn: $0.08–$0.24 (90% CI)." |
| C12 | Runaway kill-switch | PreToolUse | Session cumulative cost > user ceiling | ✅ block — decision=block returned to Claude Code |

### 6.4 Category D — ROI / outcome attribution (batch)

| ID | Name | Trigger | Logic |
|---|---|---|---|
| D13 | Cost-per-merged-PR | GitEvent(pr_merged) | Correlate sessions where `git_branch = PR.head` OR session commits ∈ PR commit list OR session file-edits ∩ PR changed files; confidence-scored; sum cost |
| D14 | Abandoned-session waste | Nightly | Sessions with no commit within 7 days on that branch AND no PR opened → tagged "likely abandoned"; weekly $ rolled up |

### 6.5 Trigger → rules routing

```
PreToolUse        → A1, C12
PostToolUse       → A3, A5, B8, (updates C10/C11 baselines)
UserPromptSubmit  → A2, A4 (predictive), B6, C10, C11
Stop              → A3, A4, A5, B7, B9
PollTick (500ms)  → non-hook tools rerun A1/A5/B8 retrospectively
GitEvent          → D13
Nightly cron      → B6 clustering, B7 clustering, B9 mining, D14
```

### 6.6 Thresholds + user control

Stored in `feature_flags.config_json`. TUI "Rules" tab toggles enable/disable, flips hard-block mode, adjusts numeric thresholds.

Example:
```json
{ "A1_redundant_read": { "enabled": true, "hard_block": false, "min_repeat_count": 2 } }
```

### 6.7 Suggested-action kinds

- B6 / B7 → generate CLAUDE.md diff; user presses `a` to apply
- B9 → scaffold `.claude/commands/<name>.md` with extracted template
- A4 → copy "use --model sonnet" hint to clipboard
- A2 → issue `/compact` reminder

---

## 7. Hook protocol

### 7.1 Installation

`tokscale hook install [--global|--local]` writes marker-tagged entries to the appropriate `settings.json`:

```json
{
  "hooks": {
    "PreToolUse":       [{"matcher": "*", "hooks": [{"type": "command", "command": "tokscale hook exec PreToolUse"}]}],
    "PostToolUse":      [{"matcher": "*", "hooks": [{"type": "command", "command": "tokscale hook exec PostToolUse"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "tokscale hook exec UserPromptSubmit"}]}],
    "Stop":             [{"hooks": [{"type": "command", "command": "tokscale hook exec Stop"}]}]
  }
}
```

- Scope `--global` → `~/.claude/settings.json`
- Scope `--local` → `$PWD/.claude/settings.json`
- Backs up original to `settings.json.tokscale-bak` before modification
- Uninstall removes only marker-tagged entries; idempotent
- `tokscale hook status` reports installed scopes + payload-schema version compatibility

### 7.2 Runtime (`tokscale hook exec <kind>`)

1. Read JSON payload from stdin (`session_id`, `transcript_path`, `tool_name`, `tool_input`, etc.)
2. Open SQLite (WAL, `busy_timeout=5000`)
3. Redaction pipeline → `hook_events` insert
4. Detection runner resolves matching rules, evaluates in priority order
5. Aggregate: highest severity wins; dedup by `rule_id + args_hash`
6. Emit Claude Code hook response on stdout:
   ```json
   {
     "decision": "block",
     "reason": "tokscale: file X already Read in turn 3 — reuse cached result",
     "additionalContext": "note: 3 redundant tool-calls flagged this session"
   }
   ```
7. Latency target **<50ms p95**, hard cap **200ms** via AbortController; on overflow queue async, emit empty response

### 7.3 Safety rails

- Hook exits 0 on internal errors (never breaks agent flow)
- Detection failures caught + logged; user is never blocked by a bug
- Rotating log at `~/.config/tokscale/hook.log` (10 MB cap)
- Hard-block mode off by default per rule; requires explicit `tokscale rules hard-block <id>`

### 7.4 Daemon fallback for non-hook tools

Existing chokidar watcher upgraded to emit synthetic triggers into the detection engine. Detectors are trigger-source-agnostic. For severity ≥ warn, daemon calls `node-notifier` (agent context is not reachable in Codex/OpenCode/Gemini yet).

---

## 8. TUI additions

Existing tabs retained. Additions:

| Tab | Key | Content |
|---|---|---|
| Insights | 7 | Live detection feed grouped by category. `Enter` expands, `a` acknowledges, `d` dismisses rule permanently. "$X saved since install" ticker. |
| Rules | 8 | Toggle A/B/C/D rules, flip hard-block mode, adjust thresholds. `space` toggles, `+/-` adjusts. |
| Attribution | 9 | Cost-per-PR table (D13) with repo filter. Abandoned-session waste (D14). Drill into sessions that fed a PR. |
| Hooks | 0 | Install status (global/local/both). Latency histogram. Recent hook events (debug). `i` install, `u` uninstall. |

Overlays:
- `!` → CLAUDE.md suggestions (B6 + B7 output); `a` applies diff to nearest CLAUDE.md, `c` copies to clipboard
- `@` → saved-command candidates (B9); `s` writes `.claude/commands/<name>.md`

Real-time HUD in every tab:
```
ctx 38k/200k (19%) · ETA 22 turns · today $12.40
```
Colors: amber ≥75% ctx, red ≥90%. ETA sourced from C10.

Tab-bar unread badge: `Insights⁷ (3)` in amber when detections pending.

---

## 9. CLI commands

```bash
tokscale                                  # TUI (default)
tokscale hook install [--global|--local]
tokscale hook uninstall
tokscale hook status
tokscale hook exec <kind>                 # called by Claude Code, not humans
tokscale daemon start [--detach]
tokscale daemon stop
tokscale daemon status
tokscale redact add <pattern> [--replacement <str>]
tokscale redact list
tokscale redact remove <id>
tokscale redact test <file>               # dry-run against corpus
tokscale rules list
tokscale rules enable|disable <rule_id>
tokscale rules set-threshold <rule_id> <key> <value>
tokscale rules hard-block <rule_id>
tokscale export [--since <date>]          # JSON dump
tokscale vacuum                           # manual retention purge
tokscale privacy audit                    # summarize what's stored
tokscale wipe                             # destructive, confirmed
```

---

## 10. Privacy + redaction

- Content stored plaintext after passing through ordered regex pipeline
- Builtin rules ship with: AWS access keys, GitHub tokens, generic `sk-*`, `.env` contents, email, phone, private SSH key headers
- User rules live in `redaction_rules` table, editable via `tokscale redact ...`
- `tokscale redact test <file>` runs rules against a corpus and reports matches for verification
- `tokscale privacy audit` summarizes row counts + sample hashed previews
- `tokscale wipe` deletes DB + logs after typed confirmation
- Encryption at rest is deferred to v2 (documented, not implemented)

---

## 11. Implementation phases

Each phase ships independently. Every phase ends with green `npm run lint` + `npm run test:run` + TUI smoke + HANDOVER.md update.

**Phase 1 — Storage foundation:** SQLite schema + migrations, legacy importer, WAL + prepared statements, retention/vacuum, redaction pipeline + builtins.

**Phase 2 — Data capture upgrade:** extend all four parsers to emit per-message + tool_call rows; git event worker (`gh pr list` + `git log` poll); resumable backfill job.

**Phase 3 — Detection engine core:** rule registry, `DetectionContext`, session-state cache, threshold loader, feature-flags CRUD, runner, latency-budget enforcement.

**Phase 4 — Hook infrastructure (Claude Code):** `tokscale hook install|uninstall|status` (idempotent, marker-tagged, backed up), `tokscale hook exec <kind>` (stdin/stdout contract, latency histogram, rotating log).

**Phase 5 — Category A + C rules:** implement A1–A5, C10–C12; hint formatters; hard-block wiring for A1 + A4 + C12.

**Phase 6 — Category B + D rules:** local embedding setup (xenova/all-MiniLM via onnxruntime-node, lazy-loaded, cached under `~/.config/tokscale/models/`); B6–B9; D13 correlation worker (branch + commit + file overlap confidence scoring); D14 nightly; embedded cron.

**Phase 7 — TUI + daemon + polish:** Insights/Rules/Attribution/Hooks tabs, `!`/`@` overlays, HUD, `tokscale daemon` with PID file + detach, node-notifier, all new CLI commands, end-to-end integration smoke.

**Gating:** Phase 3 gates 5–6. Phase 4 gates 5. Phase 2 gates 5–6.

---

## 12. Testing strategy

### 12.1 Unit (vitest)
- Schema migrations forward + idempotent
- Redaction matrix: secrets in/out, overlaps, user-added rules
- Each rule: table-driven fixtures → expected `Detection | null`
- Hook decision aggregation: `[info, warn, block] → block` with combined reason
- Threshold overrides via `feature_flags`
- Cost estimator (C11) confidence intervals on historical distributions
- PR correlation: synthetic fixtures for branch_match, commit_ancestor, file_overlap edges

### 12.2 Integration (new `test/integration/`)
- End-to-end hook flow: stdin → `tokscale hook exec` → stdout + DB rows
- Backfill: fixture session files → row-count assertions
- Daemon polling: new JSONL line → detection fires within 1s
- Hook install/uninstall round-trip on 5 pre-existing settings.json shapes
- Nightly batch on crafted 90-day corpus → B6/B7/B9/D14 outputs

### 12.3 Performance
- Hook exec p95 <50ms on 2.7M-row DB (CI seeded)
- Hot-path query plans (`EXPLAIN QUERY PLAN` assertions)
- Backfill ≥5k messages/sec

### 12.4 Manual TUI smoke (per release)
- All tabs render on empty, small, 90-day DBs
- Keyboard navigation through new tabs + overlays
- No crash on malformed DB, missing hook config, denied FS permissions

### 12.5 Fixtures
- `test/fixtures/sessions/` (extended)
- `test/fixtures/pr-correlation/` synthetic repos
- `test/fixtures/detections/` per rule
- `test/fixtures/settings-json/` pristine / installed / user-modified / conflicting
- `test/fixtures/redaction/red-team.json` secret-heavy corpus

---

## 13. Risks + mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Hook latency spikes block agent flow | UX regression, trust loss | 200ms hard cap + AbortController; latency histogram; CI perf gate |
| SQLite write contention (hook + TUI + daemon) | Locked-DB errors | WAL, `busy_timeout=5000`, short transactions, retry with jitter |
| Redaction regex misses a secret | Plaintext credentials | Conservative defaults; `tokscale redact test`; encrypt-at-rest v2 path |
| Embedding model download fails or bloats binary | Phase 6 blocked | Lazy-load on first B6; hash+Levenshtein fallback; cached under config dir, not bundled |
| False-positive hints annoy users | Rule disabled → feature dead | Default info/warn only (never block); per-rule permanent dismiss; "acknowledged vs. active" meter |
| Hard-block breaks agent mid-task | User stuck | Opt-in only; actionable `reason` string required |
| settings.json mutation destroys custom hooks | User loses config | Pre-write backup; marker-scoped edits; uninstall restores from backup |
| DB corruption | Data loss | WAL + journaling, nightly vacuum, `tokscale export` for user backup |
| Detection rule conflicts | Noisy hints | Dedup by `rule_id + args_hash`, max 3 hints per tool call |
| Git correlation false links | Misleading cost-per-PR | Multi-signal confidence score; TUI shows confidence; exclude <0.6 from rollups |
| Nightly batch too slow | Stale B/D results | Incremental by `last_batch_run_at` per rule |
| Privacy concerns | Abandonment | Redaction on by default; `tokscale privacy audit`; easy `tokscale wipe` |
| Claude Code hook API changes | Hook breaks on CC update | Version the payload schema; graceful unknown-field handling; `hook status` reports incompatibility |

---

## 14. Acceptance criteria (v1 done)

1. All 14 rules fire at least once against seeded CI fixture corpus
2. Hook exec p95 < 50 ms over 1k runs
3. `tokscale hook install|uninstall` round-trips cleanly against 5 settings.json shapes
4. TUI renders all new tabs on empty / small / 90-day DBs
5. Redaction catches every secret in `test/fixtures/redaction/red-team.json`
6. PR correlation accuracy ≥ 85% on synthetic fixture set
7. `npm run lint` + `npm run test:run` green
8. Manual smoke on real 30-day history: hook installed, detections surface in TUI, `!` proposes a CLAUDE.md diff, `@` proposes a saved command

---

## 15. Open questions (deliberately left for implementation)

- Exact thresholds per rule — sensible defaults picked empirically during phase 5/6 against real fixture data
- Whether to ship embedding model as separate install step or auto-download on first B6 run (leaning auto, cache dir)
- Whether the TUI HUD shows for non-Claude-Code tools when context totals aren't directly reported (fallback: computed from message_tokens sum)
