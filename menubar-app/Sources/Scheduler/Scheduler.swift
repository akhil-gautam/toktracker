import Foundation
import Core
import Storage
import Detection
import GRDB

public struct NightlyJobs: Sendable {
    public let db: AppDB
    public let registry: RuleRegistry
    public init(db: AppDB, registry: RuleRegistry) {
        self.db = db
        self.registry = registry
    }

    public func run() {
        let context = DetectionContext(trigger: .nightly, db: db)
        let runner = DetectionRunner(registry: registry, db: db)
        _ = runner.run(context: context)
        markRun("nightly")
        purge(olderThanDays: 90)
    }

    private func markRun(_ name: String) {
        try? db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO batch_runs (job_name, last_run_at, last_status) VALUES (?,?,?)
                ON CONFLICT(job_name) DO UPDATE SET last_run_at=excluded.last_run_at, last_status=excluded.last_status
                """,
                arguments: [name, Int(Date().timeIntervalSince1970 * 1000), "ok"])
        }
    }

    private func purge(olderThanDays days: Int) {
        let cutoff = Int(Date().timeIntervalSince1970 * 1000) - days * 86400 * 1000
        try? db.queue.write { db in
            try db.execute(sql: "DELETE FROM messages WHERE created_at < ?", arguments: [cutoff])
            try db.execute(sql: "DELETE FROM tool_calls WHERE created_at < ?", arguments: [cutoff])
            try db.execute(sql: "DELETE FROM hook_events WHERE created_at < ?", arguments: [cutoff])
        }
    }
}

public final class NightlyScheduler: @unchecked Sendable {
    private var timer: DispatchSourceTimer?
    private let jobs: NightlyJobs
    private let queue = DispatchQueue(label: "tokscale.nightly", qos: .utility)

    public init(jobs: NightlyJobs) { self.jobs = jobs }

    public func start() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + 60, repeating: .seconds(3600))
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            self.maybeRun()
        }
        timer.resume()
        self.timer = timer
    }

    public func stop() {
        timer?.cancel()
        timer = nil
    }

    private func maybeRun() {
        let lastRun: Int = (try? jobs.db.queue.read { db in
            try Int.fetchOne(db, sql: "SELECT last_run_at FROM batch_runs WHERE job_name = 'nightly'") ?? 0
        }) ?? 0
        let now = Int(Date().timeIntervalSince1970 * 1000)
        if lastRun + 86400 * 1000 < now {
            jobs.run()
        }
    }

    deinit { stop() }
}
