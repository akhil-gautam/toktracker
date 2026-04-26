import SwiftUI
import Core
import Storage
import Parsers
import Capture
import Detection
import Hook
import GitOps
import Scheduler
import GRDB

// Intentionally not @MainActor: Swift 5.10 (the CI toolchain) infers
// @MainActor-isolated properties from that annotation, which breaks dozens
// of view-side accessors that are still inferred nonisolated in 5.x. The
// @Observable macro provides the atomic storage we need, and @MainActor-
// sensitive writes (SwiftUI rebuilds, timers) hop onto the main actor
// explicitly at the call site.
@Observable
public final class AppStore {
    public var db: AppDB?
    public var store = SessionStore()
    public var aggregates: SessionStore.Aggregates = SessionStore.Aggregates()
    public var isLoading: Bool = true
    public var errorMessage: String?
    public var detections: [Detection] = []
    public var budgets: [Budget] = []
    public var hookStatus: HookStatus = HookStatus(installed: false, kinds: [])
    public var lastRefresh: Date = Date()

    private var watcher: SessionWatcher?
    private var nightlyScheduler: NightlyScheduler?
    private var gitTimer: DispatchSourceTimer?
    private let registry = ParserRegistry.default
    private let ruleRegistry = RuleRegistryFactory.allRules()

    public init() {}

    public func bootstrap() async {
        guard db == nil else { return }
        do {
            let db = try Boot.open()
            try RedactionRulesRepo(db: db).seedBuiltinsIfNeeded()
            try BudgetsRepo(db: db).ensureSchema()
            self.db = db
        } catch {
            errorMessage = "DB open failed: \(error.localizedDescription)"
            isLoading = false
            return
        }

        await fullScan()
        startWatching()
        startNightlyJobs()
        startGitPolling()
        refreshHookStatus()
        isLoading = false
    }

    public func refresh() {
        guard let db else { return }
        aggregates = store.aggregates(); lastRefresh = Date()
        detections = (try? DetectionsRepo(db: db).recent(limit: 50)) ?? []
        budgets = (try? BudgetsRepo(db: db).all()) ?? []
    }

    public func refreshHookStatus() {
        hookStatus = HookInstaller.status(
            at: HookInstaller.defaultSettingsURL(global: true))
    }

    private func fullScan() async {
        guard let db else { return }
        let sessionsRepo = SessionsRepo(db: db)
        let cursors = CursorStore(db: db)
        let redactor = (try? RedactionRulesRepo(db: db).all()).map(Redactor.init)
            ?? Redactor(rules: BuiltinRedactionRules.all)
        let recorder = MessageRecorder(db: db, redactor: redactor)

        // Seed the in-memory store with every session the DB already knows
        // about so the aggregator reflects all history on re-launch, not just
        // the delta we parse this run.
        let existing = (try? sessionsRepo.listAll()) ?? []
        store.reset(existing)

        var delta: [Session] = []
        for parser in registry.parsers {
            guard let files = try? parser.discover() else { continue }
            for file in files {
                let cursor = (try? cursors.get(file.path)) ?? 0
                guard let result = try? await parser.parse(path: file, fromOffset: cursor) else { continue }
                for s in result.sessions {
                    try? sessionsRepo.upsert(s)
                    delta.append(s)
                }
                persist(result: result, recorder: recorder)
                try? cursors.set(file.path, offset: result.newOffset)
            }
        }

        if !delta.isEmpty { store.add(delta) }
        aggregates = store.aggregates(); lastRefresh = Date()
        detections = (try? DetectionsRepo(db: db).recent(limit: 50)) ?? []
        budgets = (try? BudgetsRepo(db: db).all()) ?? []
    }

    private func persist(result: ParseResult, recorder: MessageRecorder) {
        var messageIds: [String: [Int: Int64]] = [:]
        for msg in result.messages {
            if let id = try? recorder.record(message: msg) {
                messageIds[msg.sessionId, default: [:]][msg.turnIndex] = id
            }
        }
        for call in result.toolCalls {
            let id = messageIds[call.sessionId]?[call.turnIndex] ?? 0
            try? recorder.record(toolCall: call, messageId: id)
        }
    }

    private func startWatching() {
        let directories = registry.watchDirectories()
            .filter { FileManager.default.fileExists(atPath: $0.path) }
        guard !directories.isEmpty else { return }
        let watcher = SessionWatcher(paths: directories) { [weak self] urls in
            Task { @MainActor [weak self] in
                self?.enqueue(urls: urls)
            }
        }
        watcher.start()
        self.watcher = watcher
    }

    // Coalesce rapid watcher fires: when Claude is actively streaming we see
    // dozens of writes per second, each of which was triggering a full
    // aggregates() rebuild (O(N sessions) + SwiftUI invalidation of every
    // view observing `store.aggregates`). The popover became unresponsive
    // and main-thread memory churned into the gigabytes. We now append to
    // a pending-URL set and only run handleChanges once per debounce
    // window.
    private var pendingURLs: Set<URL> = []
    private var debounceTask: Task<Void, Never>?
    private static let debounceNanos: UInt64 = 500_000_000   // 500ms

    private func enqueue(urls: [URL]) {
        for u in urls { pendingURLs.insert(u) }
        if debounceTask != nil { return }
        debounceTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: AppStore.debounceNanos)
            guard let self else { return }
            let snapshot = Array(self.pendingURLs)
            self.pendingURLs.removeAll(keepingCapacity: true)
            self.debounceTask = nil
            await self.handleChanges(snapshot)
        }
    }

    private func handleChanges(_ urls: [URL]) async {
        guard let db else { return }
        let sessionsRepo = SessionsRepo(db: db)
        let cursors = CursorStore(db: db)
        let redactor = (try? RedactionRulesRepo(db: db).all()).map(Redactor.init)
            ?? Redactor(rules: BuiltinRedactionRules.all)
        let recorder = MessageRecorder(db: db, redactor: redactor)
        var newOnes: [Session] = []
        for url in urls {
            guard let parser = registry.parser(for: url) else { continue }
            let cursor = (try? cursors.get(url.path)) ?? 0
            guard let result = try? await parser.parse(path: url, fromOffset: cursor) else { continue }
            for s in result.sessions {
                try? sessionsRepo.upsert(s)
                newOnes.append(s)
            }
            persist(result: result, recorder: recorder)
            try? cursors.set(url.path, offset: result.newOffset)
        }
        if !newOnes.isEmpty {
            store.add(newOnes)
            aggregates = store.aggregates(); lastRefresh = Date()
            detections = (try? DetectionsRepo(db: db).recent(limit: 50)) ?? []
            Notifier.shared.scanForBreaches(aggregates: aggregates, budgets: budgets)
        }
    }

    private func startNightlyJobs() {
        guard let db else { return }
        let jobs = NightlyJobs(db: db, registry: ruleRegistry)
        let scheduler = NightlyScheduler(jobs: jobs)
        scheduler.start()
        self.nightlyScheduler = scheduler
    }

    private func startGitPolling() {
        guard let db else { return }
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        timer.schedule(deadline: .now() + 30, repeating: .seconds(300))
        timer.setEventHandler { [weak self] in
            self?.pollGit(db: db)
        }
        timer.resume()
        self.gitTimer = timer
    }

    private nonisolated func pollGit(db: AppDB) {
        backfillGitRepo(db: db)
        let worker = GitEventWorker(db: db)
        let correlator = PRCorrelator(db: db)
        // Get unique repos from sessions
        let repos = (try? db.queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT DISTINCT git_repo FROM sessions
                WHERE git_repo IS NOT NULL AND git_repo != ''
                """)
        }) ?? []
        let commitCorrelator = CommitCorrelator(db: db)
        for repo in repos {
            worker.pollPullRequests(repo: repo)
            // Correlate any PRs we now know about
            let prNumbers = (try? db.queue.read { db in
                try Int.fetchAll(db, sql: """
                    SELECT DISTINCT pr_number FROM git_events
                    WHERE repo = ? AND kind = 'pr_merged' AND pr_number IS NOT NULL
                    """, arguments: [repo])
            }) ?? []
            for pr in prNumbers {
                correlator.correlate(repo: repo, prNumber: pr)
            }

            // Commit-level attribution — needs a local working copy to run
            // `git log`, so we re-use the most recent cwd Claude Code reported
            // for this repo. Without a cwd we skip; the next session in that
            // repo will backfill it.
            if let cwd = latestCwd(forRepo: repo, db: db) {
                let commits = worker.pollCommits(
                    repo: repo, cwd: URL(fileURLWithPath: cwd), limit: 100)
                for c in commits {
                    commitCorrelator.correlate(repo: repo, commit: c)
                }
            }
        }
    }

    private nonisolated func latestCwd(forRepo repo: String, db: AppDB) -> String? {
        try? db.queue.read { db in
            try String.fetchOne(db, sql: """
                SELECT cwd FROM sessions
                WHERE git_repo = ? AND cwd IS NOT NULL AND cwd != ''
                ORDER BY started_at DESC LIMIT 1
                """, arguments: [repo])
        } ?? nil
    }

    /// Claude Code JSONL lines carry cwd but not the remote repo slug, so sessions
    /// historically landed with `git_repo=''`. Resolve once per distinct cwd via
    /// `git config --get remote.origin.url`, then bulk-update — this unlocks PR
    /// attribution for pre-existing rows without reparsing.
    private nonisolated func backfillGitRepo(db: AppDB) {
        let cwds = (try? db.queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT DISTINCT cwd FROM sessions
                WHERE (git_repo IS NULL OR git_repo = '')
                  AND cwd IS NOT NULL AND cwd != ''
                """)
        }) ?? []
        for cwd in cwds {
            guard let slug = GitRepoResolver.shared.slug(forCwd: cwd) else { continue }
            _ = try? db.queue.write { db in
                try db.execute(sql: """
                    UPDATE sessions SET git_repo = ?
                    WHERE cwd = ? AND (git_repo IS NULL OR git_repo = '')
                    """, arguments: [slug, cwd])
            }
        }
    }
}
