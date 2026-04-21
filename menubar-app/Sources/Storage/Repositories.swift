import Foundation
import GRDB
import Core

public struct SessionsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func upsert(_ session: Session) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions
                  (id, conversation_id, tool, model, cwd, git_repo, git_branch,
                   started_at, ended_at,
                   input_tokens, output_tokens, cache_read, cache_write, cost_millicents)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                  conversation_id=excluded.conversation_id,
                  ended_at=excluded.ended_at,
                  input_tokens=excluded.input_tokens,
                  output_tokens=excluded.output_tokens,
                  cache_read=excluded.cache_read,
                  cache_write=excluded.cache_write,
                  cost_millicents=excluded.cost_millicents
                """,
                arguments: [
                    session.id, session.conversationId,
                    session.tool.rawValue, session.model,
                    session.cwd, session.gitRepo, session.gitBranch,
                    Int(session.startedAt.timeIntervalSince1970 * 1000),
                    session.endedAt.map { Int($0.timeIntervalSince1970 * 1000) },
                    session.inputTokens, session.outputTokens,
                    session.cacheReadTokens, session.cacheWriteTokens,
                    session.costMillicents,
                ])
        }
    }

    public func count() throws -> Int {
        try db.queue.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM sessions") ?? 0
        }
    }

    public func listAll() throws -> [Session] {
        try db.queue.read { db in
            let rows = try Row.fetchAll(db, sql: "SELECT * FROM sessions")
            return rows.compactMap { Self.fromRow($0) }
        }
    }

    private static func fromRow(_ row: Row) -> Session? {
        guard let id: String = row["id"],
              let toolRaw: String = row["tool"],
              let tool = Tool(rawValue: toolRaw),
              let model: String = row["model"],
              let startedMs: Int = row["started_at"] else { return nil }

        let endedMs: Int? = row["ended_at"]
        let convId: String = (row["conversation_id"] as String?) ?? id
        return Session(
            id: id, conversationId: convId, tool: tool, model: model, provider: "",
            inputTokens: (row["input_tokens"] as Int?) ?? 0,
            outputTokens: (row["output_tokens"] as Int?) ?? 0,
            cacheReadTokens: (row["cache_read"] as Int?) ?? 0,
            cacheWriteTokens: (row["cache_write"] as Int?) ?? 0,
            costMillicents: (row["cost_millicents"] as Int?) ?? 0,
            cwd: row["cwd"],
            gitRepo: row["git_repo"],
            gitBranch: row["git_branch"],
            startedAt: Date(timeIntervalSince1970: Double(startedMs) / 1000),
            endedAt: endedMs.map { Date(timeIntervalSince1970: Double($0) / 1000) })
    }
}

public struct ConversationMessage: Sendable, Identifiable, Hashable {
    public let id: Int64
    public let sessionId: String      // turn id
    public let turnIndex: Int
    public let role: String           // "user" | "assistant" | "system"
    public let content: String?       // may be nil when redaction stored only a hash
    public let inputTokens: Int
    public let outputTokens: Int
    public let cacheRead: Int
    public let cacheWrite: Int
    public let createdAt: Date
    public init(id: Int64, sessionId: String, turnIndex: Int, role: String,
                content: String?, inputTokens: Int, outputTokens: Int,
                cacheRead: Int, cacheWrite: Int, createdAt: Date) {
        self.id = id; self.sessionId = sessionId; self.turnIndex = turnIndex
        self.role = role; self.content = content
        self.inputTokens = inputTokens; self.outputTokens = outputTokens
        self.cacheRead = cacheRead; self.cacheWrite = cacheWrite
        self.createdAt = createdAt
    }
}

public struct MessagesRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    /// Fetch messages belonging to a conversation (joins through sessions).
    /// Ordered by turn time so the transcript reads top-to-bottom.
    public func byConversation(_ conversationId: String, limit: Int = 2000) throws -> [ConversationMessage] {
        try db.queue.read { db in
            try Row.fetchAll(db, sql: """
                SELECT m.id, m.session_id, m.turn_index, m.role, m.content_redacted,
                       m.input_tokens, m.output_tokens, m.cache_read, m.cache_write,
                       m.created_at
                FROM messages m
                WHERE m.session_id = ?
                ORDER BY m.created_at ASC, m.turn_index ASC
                LIMIT ?
                """, arguments: [conversationId, limit])
                .compactMap { row in
                    guard let id: Int64 = row["id"],
                          let sid: String = row["session_id"],
                          let turn: Int = row["turn_index"],
                          let role: String = row["role"],
                          let created: Int64 = row["created_at"]
                    else { return nil }
                    return ConversationMessage(
                        id: id, sessionId: sid, turnIndex: turn, role: role,
                        content: row["content_redacted"] as String?,
                        inputTokens: (row["input_tokens"] as Int?) ?? 0,
                        outputTokens: (row["output_tokens"] as Int?) ?? 0,
                        cacheRead: (row["cache_read"] as Int?) ?? 0,
                        cacheWrite: (row["cache_write"] as Int?) ?? 0,
                        createdAt: Date(timeIntervalSince1970: Double(created) / 1000))
                }
        }
    }

    /// FTS5 search over message content. Returns distinct conversation ids
    /// (matches SessionSummary.id) that contain a matching message.
    public func searchSessionIds(query: String, limit: Int = 200) throws -> [String] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return [] }
        let ftsQuery = Self.toFTSQuery(trimmed)
        return try db.queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT DISTINCT m.session_id
                FROM messages_fts fts
                JOIN messages m ON m.id = fts.rowid
                WHERE messages_fts MATCH ?
                ORDER BY m.created_at DESC
                LIMIT ?
                """, arguments: [ftsQuery, limit])
        }
    }

    /// Build an FTS5 MATCH expression from user input. Splits on whitespace,
    /// quotes each token as a prefix-matched phrase so reserved characters
    /// (`:` `-` `(` `)` `"`) in the query don't break the parse.
    private static func toFTSQuery(_ raw: String) -> String {
        raw.split(whereSeparator: { $0.isWhitespace })
            .map { token -> String in
                let escaped = token.replacingOccurrences(of: "\"", with: "\"\"")
                return "\"\(escaped)\"*"
            }
            .joined(separator: " ")
    }
}

public struct DetectionsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func insert(_ detection: Detection) throws -> Int64 {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO detections
                  (session_id, rule_id, severity, summary, metadata_json, created_at)
                VALUES (?,?,?,?,?,?)
                """,
                arguments: [
                    detection.sessionId, detection.ruleId,
                    detection.severity.rawValue, detection.summary,
                    detection.detail,
                    Int(detection.createdAt.timeIntervalSince1970 * 1000),
                ])
            return db.lastInsertedRowID
        }
    }

    public func recent(limit: Int = 50) throws -> [Detection] {
        try db.queue.read { db in
            let rows = try Row.fetchAll(db, sql: """
                SELECT * FROM detections ORDER BY created_at DESC LIMIT ?
                """, arguments: [limit])
            return rows.compactMap { row -> Detection? in
                guard let ruleId: String = row["rule_id"],
                      let sevRaw: String = row["severity"],
                      let severity = Severity(rawValue: sevRaw),
                      let summary: String = row["summary"],
                      let createdMs: Int = row["created_at"] else { return nil }
                let idNum: Int64 = row["id"]
                return Detection(
                    id: idNum,
                    ruleId: ruleId,
                    sessionId: row["session_id"],
                    trigger: .stop,
                    severity: severity,
                    summary: summary,
                    detail: row["metadata_json"],
                    createdAt: Date(timeIntervalSince1970: Double(createdMs) / 1000),
                    acknowledgedAt: (row["acknowledged_at"] as Int?).map { Date(timeIntervalSince1970: Double($0) / 1000) })
            }
        }
    }

    public func acknowledge(id: Int64) throws {
        try db.queue.write { db in
            try db.execute(sql: "UPDATE detections SET acknowledged_at=? WHERE id=?",
                arguments: [Int(Date().timeIntervalSince1970 * 1000), id])
        }
    }
}

public struct HookEventsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func insert(sessionId: String?, kind: String, payloadJSON: String,
                       decision: String?, reason: String?, latencyMs: Int) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO hook_events
                  (session_id, hook_kind, payload_json, decision, reason, latency_ms, created_at)
                VALUES (?,?,?,?,?,?,?)
                """,
                arguments: [
                    sessionId, kind, payloadJSON, decision, reason, latencyMs,
                    Int(Date().timeIntervalSince1970 * 1000),
                ])
        }
    }
}

public struct GitEventsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func insert(repo: String, kind: String, sha: String?, prNumber: Int?,
                       branch: String?, title: String? = nil) throws {
        try db.queue.write { db in
            // INSERT OR IGNORE skips updating an existing row, so titles learned
            // on a second poll would be lost. Use ON CONFLICT DO UPDATE instead,
            // but only overwrite title when the new poll actually provided one.
            try db.execute(sql: """
                INSERT INTO git_events
                  (repo, kind, sha, pr_number, branch, title, created_at)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(repo, kind, COALESCE(sha,''), COALESCE(pr_number,0))
                DO UPDATE SET title = COALESCE(excluded.title, git_events.title)
                """,
                arguments: [
                    repo, kind, sha, prNumber, branch, title,
                    Int(Date().timeIntervalSince1970 * 1000),
                ])
        }
    }
}

public struct CommitAttributionsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func insert(sha: String, repo: String, sessionId: String,
                       branch: String?, subject: String?,
                       committedAt: Int64) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO commit_attributions
                  (commit_sha, repo, session_id, branch, subject, committed_at, created_at)
                VALUES (?,?,?,?,?,?,?)
                """,
                arguments: [
                    sha, repo, sessionId, branch, subject,
                    committedAt,
                    Int(Date().timeIntervalSince1970 * 1000),
                ])
        }
    }
}

public struct PrAttributionsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func insert(prNumber: Int, repo: String, sessionId: String,
                       overlapKind: String, confidence: Double) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO pr_attributions
                  (pr_number, repo, session_id, overlap_kind, confidence)
                VALUES (?,?,?,?,?)
                """,
                arguments: [prNumber, repo, sessionId, overlapKind, confidence])
        }
    }
}

public struct FeatureFlagsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func get(_ key: String) throws -> (enabled: Bool, config: String?)? {
        try db.queue.read { db in
            let row = try Row.fetchOne(db,
                sql: "SELECT enabled, config_json FROM feature_flags WHERE key = ?",
                arguments: [key])
            guard let row else { return nil }
            return (row["enabled"] == 1, row["config_json"])
        }
    }

    public func set(_ key: String, enabled: Bool, config: String? = nil) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO feature_flags (key, enabled, config_json) VALUES (?,?,?)
                ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled, config_json=excluded.config_json
                """,
                arguments: [key, enabled ? 1 : 0, config])
        }
    }
}
