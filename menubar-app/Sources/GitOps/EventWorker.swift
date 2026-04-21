import Foundation
import Core
import Storage
import GRDB

public struct GitEventWorker: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    /// Parsed commit metadata for downstream correlation.
    public struct CommitInfo: Sendable {
        public let sha: String
        public let subject: String?
        public let branch: String?
        public let committedAt: Int64  // ms since epoch
    }

    @discardableResult
    public func pollCommits(repo: String, cwd: URL, limit: Int = 100) -> [CommitInfo] {
        let sep = "\u{1F}"
        let output = run("/usr/bin/git", arguments: [
            "-C", cwd.path, "log",
            "-\(limit)", "--pretty=format:%H\(sep)%ct\(sep)%s\(sep)%D",
        ])
        let repoStore = GitEventsRepo(db: db)
        var commits: [CommitInfo] = []
        for line in output.split(separator: "\n", omittingEmptySubsequences: true) {
            let parts = line.components(separatedBy: sep)
            guard parts.count >= 4 else { continue }
            let sha = parts[0]
            let committedAtMs = (Int64(parts[1]) ?? 0) * 1000
            let subject = parts[2].isEmpty ? nil : parts[2]
            let branch = Self.extractBranch(parts[3])
            _ = try? repoStore.insert(
                repo: repo, kind: "commit", sha: sha,
                prNumber: nil, branch: branch)
            commits.append(.init(sha: sha, subject: subject,
                                 branch: branch, committedAt: committedAtMs))
        }
        return commits
    }

    public func pollPullRequests(repo: String) {
        let output = run("/usr/bin/env", arguments: [
            "gh", "pr", "list", "--state", "merged", "--limit", "20",
            "--json", "number,mergeCommit,headRefName,title",
            "--repo", repo,
        ])
        guard let data = output.data(using: .utf8),
              let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        let repoStore = GitEventsRepo(db: db)
        for item in items {
            let number = item["number"] as? Int
            let sha = (item["mergeCommit"] as? [String: Any])?["oid"] as? String
            let branch = item["headRefName"] as? String
            let title = item["title"] as? String
            _ = try? repoStore.insert(
                repo: repo, kind: "pr_merged", sha: sha,
                prNumber: number, branch: branch, title: title)
        }
    }

    private static func extractBranch(_ refs: String) -> String? {
        let parts = refs.split(separator: ",")
        for p in parts {
            let t = p.trimmingCharacters(in: .whitespaces)
            if t.hasPrefix("HEAD -> ") { return String(t.dropFirst(8)) }
        }
        return nil
    }

    private func run(_ launch: String, arguments: [String]) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: launch)
        process.arguments = arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()
        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return ""
        }
    }
}

public struct CommitCorrelator: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    /// Attach a commit to the per-turn session row whose conversation was
    /// active (same repo + branch + timestamp within [startedAt, endedAt + 2h])
    /// when the commit landed. Pick the largest-cost turn in the window so the
    /// attribution points at the session that actually did the work.
    public func correlate(repo: String, commit: GitEventWorker.CommitInfo) {
        guard let branch = commit.branch else { return }
        let windowEnd = commit.committedAt
        let windowStart = commit.committedAt - (12 * 3_600_000) // 12h lookback
        let session = try? db.queue.read { db -> Row? in
            try Row.fetchOne(db, sql: """
                SELECT id, cost_millicents, started_at FROM sessions
                WHERE git_repo = ? AND git_branch = ?
                  AND started_at >= ? AND started_at <= ?
                ORDER BY cost_millicents DESC LIMIT 1
                """, arguments: [repo, branch, windowStart, windowEnd])
        }
        guard let row = session ?? nil,
              let sid: String = row["id"] else { return }
        _ = try? CommitAttributionsRepo(db: db).insert(
            sha: commit.sha, repo: repo, sessionId: sid,
            branch: commit.branch, subject: commit.subject,
            committedAt: commit.committedAt)
    }
}

public struct PRCorrelator: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func correlate(repo: String, prNumber: Int) {
        guard let branch = branch(for: repo, prNumber: prNumber) else { return }
        let sessions = (try? db.queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT id FROM sessions WHERE git_repo = ? AND git_branch = ?
                """, arguments: [repo, branch])
        }) ?? []
        for sid in sessions {
            _ = try? PrAttributionsRepo(db: db).insert(
                prNumber: prNumber, repo: repo, sessionId: sid,
                overlapKind: "branch", confidence: 0.95)
        }
    }

    private func branch(for repo: String, prNumber: Int) -> String? {
        (try? db.queue.read { db in
            try String.fetchOne(db, sql: """
                SELECT branch FROM git_events WHERE repo = ? AND pr_number = ?
                """, arguments: [repo, prNumber])
        }) ?? nil
    }
}
