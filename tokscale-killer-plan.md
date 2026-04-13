# Tokscale Killer — Build Plan

> CLI + macOS Menu Bar App + Rails API server  
> Stack: Ink/Node.js · Swift/SwiftUI · Rails API-only · PostgreSQL · Sidekiq · Redis

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [System Architecture](#2-system-architecture)
3. [CLI — Ink / Node.js](#3-cli--ink--nodejs)
4. [macOS Menu Bar App — Swift / SwiftUI](#4-macos-menu-bar-app--swift--swiftui)
5. [Rails API Server](#5-rails-api-server)
6. [PostgreSQL Schema](#6-postgresql-schema)
7. [Sidekiq Background Jobs](#7-sidekiq-background-jobs)
8. [Key Features Implementation](#8-key-features-implementation)
9. [Data Flow](#9-data-flow)
10. [Phased Build Order](#10-phased-build-order)

---

## 1. Product Vision

Tokscale shows you what you already spent. This product prevents overspending, explains *why* you spent it, and lets teams manage it together.

### What makes this 100x better

| Feature | Tokscale | This product |
|---|---|---|
| Budget guardrails | ❌ | ✅ Per-project caps with alerts |
| Session intelligence | ❌ | ✅ Cost per PR / task / repo |
| Team / org mode | ❌ | ✅ Per-seat dashboards, team budgets |
| Attribution engine | ❌ | ✅ git cwd → repo / branch / ticket |
| Anomaly detection | ❌ | ✅ Runaway agent alerts in real time |
| Menu bar app | ❌ | ✅ Live cost in menu bar, native macOS |
| Persistent server | ❌ | ✅ Rails + Postgres, full history forever |
| Offline-first | ❌ | ✅ Local SQLite cache in menu bar app |

---

## 2. System Architecture

```
LOCAL FILES                        SERVER
~/.claude/projects/*.jsonl  ──┐
~/.codex/sessions/*.jsonl   ──┤   FSEvents watch
~/.local/share/opencode/    ──┤
~/.gemini/tmp/*/chats/      ──┘
         │
         ▼
┌─────────────────────┐     ┌──────────────────────────────────────┐
│  CLI (Ink/Node.js)  │────▶│  Rails API (API-only)                │
│  tokscale           │     │  JWT auth · /api/v1/sync             │
│  tokscale push      │     │  /budgets · /anomalies · /stats      │
└─────────────────────┘     └──────────────┬───────────────────────┘
                                           │         │
┌─────────────────────┐                   │    ┌────▼──────┐
│  Menu Bar App       │────▶──────────────┘    │ Sidekiq   │
│  Swift / SwiftUI    │                        │ + Redis   │
│  FSEvents watcher   │                        └────┬──────┘
│  Local SQLite cache │                             │
└─────────────────────┘                       ┌────▼──────┐
                                              │ PostgreSQL│
                                              └───────────┘
```

Both the CLI and the menu bar app are independent clients of the same Rails API, authenticating with the same JWT stored in macOS Keychain.

---

## 3. CLI — Ink / Node.js

### Tech choices

- **[Ink](https://github.com/vadimdemedes/ink)** — React for the terminal. Components, hooks, diffed re-renders.
- **chokidar** — file watcher that delegates to FSEvents on macOS (zero-overhead, kernel-level).
- **keytar** — stores JWT in macOS Keychain, not a flat file.
- **worker_threads** — file parsing runs off the main thread so the TUI never blocks.

### File watching strategy

```
State file: ~/.config/tokscale/state.json
{
  "cursors": {
    "~/.claude/projects/abc/session.jsonl": 4821,   // byte offset
    "~/.codex/sessions/xyz.jsonl": 1203
  },
  "last_sync": "2026-04-13T10:00:00Z"
}
```

On every FSEvents notification, only read from the stored byte offset forward. Never re-parse full files.

### Commands

```bash
tokscale                  # interactive TUI (default)
tokscale push             # one-shot sync to server (CI/cron use)
tokscale watch            # continuous sync loop
tokscale login            # GitHub OAuth → JWT → Keychain
tokscale budget set       # set budget interactively
tokscale budget status    # show budget vs spend
tokscale orgs             # manage team/org
```

### TUI views (Ink components)

- **Overview** — today's cost, model breakdown, budget ring
- **Timeline** — 7-day bar chart using `cli-spinners` / box-drawing chars
- **Budget** — progress bars per project, red highlight when over
- **Anomalies** — live feed of detected spikes
- **Team** — per-seat breakdown (org members)

### Budget alert in TUI

When a budget threshold is crossed, Ink renders a full-width red bordered box:

```
╔══════════════════════════════════════════╗
║  ⚠  Budget alert: /projects/my-edr      ║
║  $45.20 / $50.00 daily limit (90%)      ║
╚══════════════════════════════════════════╝
```

### Auth flow

1. `tokscale login` starts a local HTTP server on `localhost:9876`
2. Opens browser to `https://yourapi.com/auth/github?redirect=http://localhost:9876/callback`
3. After GitHub OAuth, server redirects to localhost with JWT in query param
4. CLI stores JWT in Keychain via `keytar.setPassword('tokscale', user, jwt)`
5. All subsequent API calls use `Authorization: Bearer <jwt>`

---

## 4. macOS Menu Bar App — Swift / SwiftUI

### Tech choices

- **SwiftUI** for views, **AppKit** for system integration (70/30 split)
- **NSMenu + NSHostingView** — not NSPopover (feels more native, instant open)
- **FSEventStreamCreate** — Apple's kernel-level file watch API
- **GRDB.swift** — SQLite ORM for local offline-first cache
- **UNUserNotificationCenter** — native macOS push notifications
- Target **macOS 14+** to use `@Observable` and `MenuBarExtra` scene

### Project setup

```
Info.plist:
  LSUIElement = YES           // no Dock icon, menu bar only
  NSAppTransportSecurity      // allow HTTPS to your API
```

### NSStatusItem setup

```swift
// AppDelegate.swift
let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

func updateTitle(cost: Double) {
    statusItem.button?.title = String(format: "$%.2f today", cost)
    statusItem.button?.image = NSImage(systemSymbolName: "chart.line.uptrend.xyaxis",
                                       accessibilityDescription: nil)
}
```

Use `NSMenu` with `NSHostingView(rootView: YourSwiftUIView())` as the item's view — not a popover.

### FSEvents file watcher (Swift)

```swift
class SessionWatcher {
    func startWatching(paths: [String]) {
        var context = FSEventStreamContext(...)
        let stream = FSEventStreamCreate(
            nil,
            eventCallback,
            &context,
            paths as CFArray,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            1.0,  // 1 second latency
            FSEventStreamCreateFlags(kFSEventStreamCreateFlagFileEvents)
        )
        FSEventStreamSetDispatchQueue(stream!, DispatchQueue.global())
        FSEventStreamStart(stream!)
    }
}
```

Watch these paths:
- `~/.claude/projects/`
- `~/.codex/sessions/`
- `~/.local/share/opencode/`
- `~/.gemini/tmp/`

### Local SQLite cache (GRDB.swift)

```swift
struct SessionRecord: Codable, FetchableRecord, PersistableRecord {
    var id: String
    var tool: String          // claude_code, codex, opencode, etc.
    var model: String
    var inputTokens: Int
    var outputTokens: Int
    var cacheTokens: Int
    var costMillicents: Int
    var cwd: String?
    var gitRepo: String?
    var startedAt: Date
    var syncedAt: Date?       // nil = not yet synced to server
}
```

Show local data immediately, sync to server in background. User always sees up-to-date data even offline.

### Sync loop

```swift
// Every 60 seconds
Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
    let unsynced = try! dbQueue.read { db in
        try SessionRecord.filter(Column("syncedAt") == nil).fetchAll(db)
    }
    if !unsynced.isEmpty {
        APIClient.shared.sync(sessions: unsynced) { success in
            if success { markAsSynced(unsynced) }
        }
    }
}
```

### Menu content (SwiftUI view)

```
┌──────────────────────────────┐
│  Today: $12.40   Week: $67   │
│  ████████░░░░░ 68% of budget │
├──────────────────────────────┤
│  claude-opus-4    $8.20      │
│  claude-sonnet-4  $3.10      │
│  codex/gpt-5      $1.10      │
├──────────────────────────────┤
│  ⚠ my-edr: 90% of daily cap │
├──────────────────────────────┤
│  Open dashboard  Preferences │
└──────────────────────────────┘
```

### Notifications

```swift
// Budget breach
let content = UNMutableNotificationContent()
content.title = "Budget alert — my-edr"
content.body = "$45 of $50 daily limit used"
content.sound = .default

UNUserNotificationCenter.current()
    .add(UNNotificationRequest(identifier: UUID().uuidString,
                               content: content, trigger: nil))
```

---

## 5. Rails API Server

### Setup

```bash
rails new tokscale-api --api --database=postgresql
```

Gems to add:
```ruby
gem 'jwt'
gem 'bcrypt'
gem 'omniauth-github'
gem 'sidekiq'
gem 'redis'
gem 'rack-cors'
gem 'pagy'           # pagination
gem 'blueprinter'    # fast serialization
```

### Authentication

Use JWT directly — no Devise. Two token types:

- **Access token**: 15 minute TTL, sent in `Authorization: Bearer` header
- **Refresh token**: 30 day TTL, stored as HTTP-only cookie

```ruby
# lib/json_web_token.rb
class JsonWebToken
  SECRET = Rails.application.credentials.jwt_secret

  def self.encode(payload, exp = 15.minutes.from_now)
    payload[:exp] = exp.to_i
    JWT.encode(payload, SECRET, 'HS256')
  end

  def self.decode(token)
    decoded = JWT.decode(token, SECRET, true, algorithm: 'HS256')
    HashWithIndifferentAccess.new(decoded[0])
  rescue JWT::DecodeError => e
    raise AuthenticationError, e.message
  end
end
```

GitHub OAuth flow:
1. CLI/app opens browser to `/auth/github`
2. OmniAuth handles GitHub callback
3. Rails creates/finds user, issues JWT
4. Redirects to `tokscale://callback?token=<jwt>` (custom URL scheme for app) or `localhost:9876/callback` (for CLI)

### Routes

```ruby
# config/routes.rb
Rails.application.routes.draw do
  namespace :api do
    namespace :v1 do
      # Auth
      post 'auth/refresh',    to: 'auth#refresh'
      delete 'auth/logout',   to: 'auth#logout'

      # Core sync
      post 'sync',            to: 'sync#create'       # bulk session upload
      get  'stats',           to: 'stats#index'        # aggregated stats
      get  'stats/daily',     to: 'stats#daily'
      get  'stats/models',    to: 'stats#models'

      # Budgets
      resources :budgets, only: [:index, :create, :update, :destroy]
      get 'budgets/status',   to: 'budgets#status'

      # Anomalies
      resources :anomalies, only: [:index]
      patch 'anomalies/:id/acknowledge', to: 'anomalies#acknowledge'

      # Attribution
      get 'attribution/repos',   to: 'attribution#repos'
      get 'attribution/branches', to: 'attribution#branches'

      # Org / team
      resources :orgs, only: [:create, :show, :update] do
        member do
          get  'members'
          get  'stats'
          post 'invite'
        end
      end
    end
  end

  # GitHub OAuth
  get  '/auth/github',          to: 'oauth#github'
  get  '/auth/github/callback', to: 'oauth#github_callback'
end
```

### Sync endpoint (core)

```ruby
# app/controllers/api/v1/sync_controller.rb
class Api::V1::SyncController < ApplicationController
  before_action :authenticate!

  def create
    sessions = sync_params[:sessions]

    # Upsert all sessions (idempotent — CLI may retry)
    inserted = SessionImporter.new(current_user, sessions).import

    # Enqueue jobs
    AnomalyDetectorJob.perform_async(current_user.id)
    BudgetAlertJob.perform_async(current_user.id)

    render json: {
      imported: inserted,
      cursor: Time.current.iso8601
    }, status: :created
  end
end
```

The sync payload from client:

```json
{
  "cursor": "2026-04-13T09:00:00Z",
  "sessions": [
    {
      "client_id": "local-uuid-abc123",
      "tool": "claude_code",
      "model": "claude-opus-4-6",
      "provider": "anthropic",
      "input_tokens": 12400,
      "output_tokens": 890,
      "cache_read_tokens": 45000,
      "cache_write_tokens": 1200,
      "cost_millicents": 8420,
      "cwd": "/Users/akhil/projects/edr-platform",
      "git_repo": "akhil/edr-platform",
      "git_branch": "feat/esf-agent",
      "started_at": "2026-04-13T08:45:00Z",
      "ended_at": "2026-04-13T08:52:00Z"
    }
  ]
}
```

---

## 6. PostgreSQL Schema

### migrations

```ruby
# users
create_table :users do |t|
  t.string  :github_id,    null: false, index: { unique: true }
  t.string  :github_login, null: false
  t.string  :email
  t.bigint  :org_id,       index: true
  t.string  :refresh_token_digest
  t.timestamps
end

# orgs
create_table :orgs do |t|
  t.string  :name,                  null: false
  t.string  :slug,                  null: false, index: { unique: true }
  t.integer :budget_daily_cents,    default: 0
  t.integer :budget_monthly_cents,  default: 0
  t.timestamps
end

# sessions (core fact table — append-only, never update)
create_table :sessions do |t|
  t.bigint  :user_id,             null: false, index: true
  t.string  :client_id,           null: false  # client-generated UUID, for dedup
  t.string  :tool,                null: false  # claude_code, codex, opencode...
  t.string  :model,               null: false
  t.string  :provider
  t.bigint  :input_tokens,        default: 0
  t.bigint  :output_tokens,       default: 0
  t.bigint  :cache_read_tokens,   default: 0
  t.bigint  :cache_write_tokens,  default: 0
  t.bigint  :reasoning_tokens,    default: 0
  t.bigint  :cost_millicents,     default: 0
  t.string  :cwd
  t.string  :git_repo             # extracted from cwd + git remote
  t.string  :git_branch
  t.string  :git_commit
  t.datetime :started_at,         null: false, index: true
  t.datetime :ended_at
  t.timestamps

  t.index [:user_id, :started_at]
  t.index [:user_id, :git_repo]
  t.index :client_id, unique: true  # dedup key
end

# budgets
create_table :budgets do |t|
  t.bigint  :user_id,         index: true
  t.bigint  :org_id,          index: true
  t.string  :scope,           null: false  # 'global', 'project', 'repo'
  t.string  :scope_value                   # e.g. 'akhil/edr-platform'
  t.string  :period,          null: false  # 'daily', 'weekly', 'monthly'
  t.integer :limit_cents,     null: false
  t.integer :alert_at_pct,    default: 80  # notify at 80% by default
  t.boolean :hard_cap,        default: false
  t.timestamps
end

# anomalies
create_table :anomalies do |t|
  t.bigint   :user_id,       null: false, index: true
  t.bigint   :session_id,    index: true
  t.string   :kind           # 'token_spike', 'runaway_loop', 'budget_breach'
  t.jsonb    :metadata,      default: {}
  t.datetime :detected_at,   null: false
  t.datetime :acknowledged_at
  t.timestamps
end

# org_daily_stats (materialized rollup — fast team dashboards)
create_table :org_daily_stats do |t|
  t.bigint  :org_id,          null: false
  t.bigint  :user_id,         null: false
  t.date    :date,            null: false
  t.bigint  :total_tokens,    default: 0
  t.bigint  :cost_millicents, default: 0
  t.integer :session_count,   default: 0
  t.timestamps

  t.index [:org_id, :date]
  t.index [:user_id, :date]
end

# model_prices (refreshed daily by PricingRefreshJob)
create_table :model_prices do |t|
  t.string  :model,                     null: false, index: { unique: true }
  t.decimal :input_price_per_million,   precision: 10, scale: 6
  t.decimal :output_price_per_million,  precision: 10, scale: 6
  t.decimal :cache_read_per_million,    precision: 10, scale: 6
  t.decimal :cache_write_per_million,   precision: 10, scale: 6
  t.string  :source                     # 'litellm', 'openrouter'
  t.timestamps
end
```

---

## 7. Sidekiq Background Jobs

### AnomalyDetectorJob

Runs after every sync. Detects runaway agents.

```ruby
class AnomalyDetectorJob
  include Sidekiq::Job

  def perform(user_id)
    user = User.find(user_id)

    # Get this user's token rate baseline (30-day rolling average tokens/hour)
    baseline = user.sessions
                   .where(started_at: 30.days.ago..)
                   .average_tokens_per_hour

    # Check the last 10 minutes
    recent = user.sessions
                 .where(started_at: 10.minutes.ago..)
                 .sum(:input_tokens) + user.sessions
                                          .where(started_at: 10.minutes.ago..)
                                          .sum(:output_tokens)

    recent_rate = recent / (10.0 / 60)  # tokens per hour

    if baseline > 0 && recent_rate > baseline * 5
      anomaly = user.anomalies.create!(
        kind: 'token_spike',
        detected_at: Time.current,
        metadata: {
          baseline_tokens_per_hour: baseline,
          recent_tokens_per_hour: recent_rate,
          multiplier: (recent_rate / baseline).round(1)
        }
      )
      NotificationDispatcher.new(user, anomaly).dispatch
    end
  end
end
```

### BudgetAlertJob

```ruby
class BudgetAlertJob
  include Sidekiq::Job

  def perform(user_id)
    user = User.find(user_id)

    user.budgets.each do |budget|
      spent = BudgetCalculator.new(user, budget).current_spend_cents
      pct = (spent.to_f / budget.limit_cents * 100).round

      next if pct < budget.alert_at_pct

      # Don't re-alert if we already alerted at this threshold
      cache_key = "budget_alert:#{budget.id}:#{pct / 10 * 10}"
      next if Rails.cache.exist?(cache_key)

      Rails.cache.write(cache_key, true, expires_in: budget.period_duration)

      NotificationDispatcher.new(user, budget, spent: spent, pct: pct).dispatch
    end
  end
end
```

### PricingRefreshJob (daily cron)

```ruby
class PricingRefreshJob
  include Sidekiq::Job

  def perform
    # Fetch from LiteLLM
    litellm_data = HTTParty.get(
      'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
    ).parsed_response

    litellm_data.each do |model, pricing|
      next unless pricing['input_cost_per_token']
      ModelPrice.upsert({
        model: model,
        input_price_per_million:  pricing['input_cost_per_token'].to_d * 1_000_000,
        output_price_per_million: pricing['output_cost_per_token'].to_d * 1_000_000,
        cache_read_per_million:   pricing['cache_read_input_token_cost'].to_d * 1_000_000,
        source: 'litellm',
        updated_at: Time.current
      }, unique_by: :model)
    end
  end
end
```

### OrgRollupJob (hourly cron)

```ruby
class OrgRollupJob
  include Sidekiq::Job

  def perform
    # Upsert org_daily_stats from raw sessions
    ActiveRecord::Base.connection.execute(<<~SQL)
      INSERT INTO org_daily_stats (org_id, user_id, date, total_tokens, cost_millicents, session_count, created_at, updated_at)
      SELECT
        u.org_id,
        s.user_id,
        DATE(s.started_at) as date,
        SUM(s.input_tokens + s.output_tokens + s.cache_read_tokens) as total_tokens,
        SUM(s.cost_millicents) as cost_millicents,
        COUNT(*) as session_count,
        NOW(), NOW()
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.org_id IS NOT NULL
        AND s.started_at >= NOW() - INTERVAL '2 days'
      GROUP BY u.org_id, s.user_id, DATE(s.started_at)
      ON CONFLICT (org_id, user_id, date)
      DO UPDATE SET
        total_tokens = EXCLUDED.total_tokens,
        cost_millicents = EXCLUDED.cost_millicents,
        session_count = EXCLUDED.session_count,
        updated_at = NOW()
    SQL
  end
end
```

### Sidekiq cron config

```ruby
# config/sidekiq.yml
:queues:
  - critical
  - default
  - low

# config/initializers/sidekiq_cron.rb (use sidekiq-cron gem)
Sidekiq::Cron::Job.create(
  name: 'Pricing refresh - daily',
  cron: '0 3 * * *',
  class: 'PricingRefreshJob'
)
Sidekiq::Cron::Job.create(
  name: 'Org rollup - hourly',
  cron: '0 * * * *',
  class: 'OrgRollupJob'
)
```

---

## 8. Key Features Implementation

### Feature 1: Budget Guardrails

**How it works:**
- User sets a budget via `tokscale budget set` or the menu bar Preferences
- Budget is stored server-side in the `budgets` table
- `BudgetAlertJob` checks after every sync
- Alert delivered via: macOS notification, menu bar red badge, CLI inline warning, optional Slack webhook

**Budget scopes:**
- `global` — total across all tools
- `project` — matched by `cwd` prefix (e.g. `/Users/akhil/projects/edr-platform`)
- `repo` — matched by `git_repo` (e.g. `akhil/edr-platform`)
- `model` — per-model spend cap

### Feature 2: Session Intelligence (Attribution)

**How it works:**
- Every session includes `cwd` from the tool's session file
- Attribution engine extracts `git_repo` and `git_branch` by reading `.git/config` and `.git/HEAD` from the `cwd`
- Stored on the `sessions` row server-side
- Stats endpoint groups by `git_repo` to answer "how much did this PR cost?"

**Git attribution:**

```javascript
// In CLI parser (Node.js)
async function extractGitInfo(cwd) {
  try {
    const gitDir = await findGitDir(cwd)
    const remoteUrl = fs.readFileSync(`${gitDir}/config`, 'utf8')
      .match(/url = (.+)/)?.[1]
    const branch = fs.readFileSync(`${gitDir}/HEAD`, 'utf8')
      .replace('ref: refs/heads/', '').trim()
    const repo = remoteUrl?.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1]
    return { git_repo: repo, git_branch: branch }
  } catch {
    return {}
  }
}
```

### Feature 3: Team / Org Mode

**How it works:**
- User creates an org: `POST /api/v1/orgs`
- Invites team members via email: `POST /api/v1/orgs/:id/invite`
- Org gets its own budget limits
- `OrgRollupJob` materializes per-seat stats hourly
- Team dashboard shows ranked list of members by cost

**Org budget hierarchy:**
```
Org monthly budget: $2,000
  └── Member budgets (per-seat daily): $50/day each
        └── Project budgets: $20/day per repo
```

### Feature 4: Anomaly Detection

**Detection rules:**
1. **Token spike** — session rate > 5× user's 30-day baseline in any 10-minute window
2. **Runaway loop** — single session exceeds 500k tokens (configurable)
3. **Budget breach** — cumulative spend crosses threshold
4. **Off-hours spike** — large spend outside user's normal working hours

**Alert channels:**
- macOS `UNUserNotificationCenter` — immediate native notification
- Menu bar icon badge — red dot + cost delta
- Slack webhook — configurable per org, shows member name + amount
- CLI `tokscale anomalies` — lists recent anomalies with context

### Feature 5: Notification Delivery

```ruby
# app/services/notification_dispatcher.rb
class NotificationDispatcher
  def initialize(user, subject, **context)
    @user = user
    @subject = subject
    @context = context
  end

  def dispatch
    # Push to menu bar app via APNS (if registered)
    ApnsPushJob.perform_async(@user.id, payload) if @user.apns_token?

    # Slack webhook (if configured)
    SlackWebhookJob.perform_async(@user.org_id, payload) if @user.org&.slack_webhook_url?

    # Store in anomalies table for CLI polling
    # (already created upstream)
  end

  private

  def payload
    {
      title: notification_title,
      body: notification_body,
      data: { kind: @subject.class.name, id: @subject.id }
    }
  end
end
```

---

## 9. Data Flow

### Real-time local flow (sub-second)

```
New JSONL line written by Claude Code
  → FSEvents fires (macOS kernel, <100ms)
  → Menu bar app Swift parser reads new bytes
  → Updates local GRDB SQLite
  → Menu bar title updates: "$12.40 today" → "$12.51 today"
  → Checks local budget rules → shows badge if needed
```

### Server sync flow (every 60 seconds)

```
Timer fires in menu bar app / CLI watch loop
  → Read all unsynced sessions from local SQLite
  → POST /api/v1/sync with delta payload (only new sessions)
  → Rails inserts to sessions table (upsert on client_id)
  → Enqueues AnomalyDetectorJob + BudgetAlertJob
  → Sidekiq picks up jobs within seconds
  → If alert needed: APNS push → macOS notification
  → Mark sessions as synced in local SQLite
```

### CI / headless flow

```
tokscale push (in GitHub Actions)
  → Reads all session files since last cursor
  → POST /api/v1/sync
  → Returns immediately (fire and forget)
```

---

## 10. Phased Build Order

### Phase 1 — Core foundation (weeks 1–3)

- [ ] Rails API: auth (GitHub OAuth + JWT), `POST /sync`, basic stats endpoint
- [ ] PostgreSQL: users, sessions, model_prices tables
- [ ] `PricingRefreshJob` — get accurate costs from day one
- [ ] CLI: file parser for Claude Code + Codex, `tokscale login`, `tokscale push`
- [ ] Menu bar app: `NSStatusItem` showing today's cost, FSEvents watcher, local SQLite

### Phase 2 — Budgets and alerts (weeks 4–5)

- [ ] `budgets` table + CRUD endpoints
- [ ] `BudgetAlertJob` in Sidekiq
- [ ] CLI: `tokscale budget set/status` commands + red-box Ink alert
- [ ] Menu bar: budget ring progress bar + macOS notification delivery
- [ ] Anomaly detection: `anomalies` table + `AnomalyDetectorJob`

### Phase 3 — Attribution (weeks 6–7)

- [ ] Git info extraction in CLI parser (reads `.git/config` + `.git/HEAD`)
- [ ] `git_repo` / `git_branch` fields on sessions table
- [ ] `GET /api/v1/attribution/repos` endpoint
- [ ] CLI: attribution view in TUI (cost grouped by repo)
- [ ] Menu bar: repo breakdown in popover menu

### Phase 4 — Team / org mode (weeks 8–10)

- [ ] `orgs` table, invite flow, org membership
- [ ] `org_daily_stats` table + `OrgRollupJob`
- [ ] `GET /api/v1/orgs/:id/stats` — team dashboard endpoint
- [ ] `NotificationDispatcher` + Slack webhook job
- [ ] CLI: `tokscale orgs` command
- [ ] Menu bar: team view tab showing per-seat costs

### Phase 5 — Polish and monetisation (weeks 11–12)

- [ ] Web dashboard (optional — or just CLI + menu bar is sufficient v1)
- [ ] Stripe integration for team plan billing
- [ ] Rate limiting on sync endpoint
- [ ] Expand tool support: Gemini CLI, OpenCode, Cursor, Amp
- [ ] Public leaderboard (optional — tokscale's main hook)

---

## Key Technical Decisions

**Why two independent clients (CLI + menu bar) rather than CLI as IPC server for menu bar?**

Simpler. Both parse the same local files independently, both talk to the same Rails API with the same JWT. No socket management, no version coupling between the two binaries. The only shared thing is the JWT in Keychain.

**Why not use tokscale's Rust parser?**

The Rust native module is a performance optimization for parsing thousands of files at startup. With FSEvents + byte-offset cursors, you're only ever parsing new bytes appended since the last read — that's fast enough in plain Node.js / Swift. Add a Rust NAPI module later if profiling shows it's needed.

**Why Rails API-only over Go/other?**

Fast to build, Sidekiq is best-in-class for background jobs, ActiveRecord migrations are painless for iterating the schema, and you're not building a high-throughput service — peak load is a few hundred sync requests per minute even at scale.

**Why local SQLite in the menu bar app?**

The menu bar must update instantly when you write code. A round-trip to a server would add 100–500ms of latency on every file change, which feels broken. Local SQLite makes the menu bar feel like a native instrument, not a network app.
