import Foundation
import GRDB

public enum StorageError: Error {
    case schemaMissing
    case appSupportUnavailable
}

public final class AppDB: @unchecked Sendable {
    public let queue: DatabaseQueue

    public init(path: String) throws {
        var config = Configuration()
        config.busyMode = .timeout(5)
        config.foreignKeysEnabled = false
        config.prepareDatabase { db in
            try db.execute(sql: "PRAGMA journal_mode = WAL")
            // Foreign keys intentionally disabled: Claude Code keys
            // `sessions` rows by assistant-turn uuid while `messages` references
            // the conversation sessionId, so the two tables don't share a key.
        }
        self.queue = try DatabaseQueue(path: path, configuration: config)
    }

    public func migrate(schemaURL: URL) throws {
        let sql = try String(contentsOf: schemaURL, encoding: .utf8)
        try queue.write { db in
            try db.execute(sql: sql)
            // v2 additive migrations — idempotent via PRAGMA check
            let cols = try Row.fetchAll(db, sql: "PRAGMA table_info(sessions)")
            let names = Set(cols.compactMap { ($0["name"] as? String) })
            if !names.contains("conversation_id") {
                try db.execute(sql: "ALTER TABLE sessions ADD COLUMN conversation_id TEXT")
                try db.execute(sql: "UPDATE sessions SET conversation_id = id WHERE conversation_id IS NULL")
            }
            try db.execute(sql: "CREATE INDEX IF NOT EXISTS idx_sessions_conv ON sessions(conversation_id, started_at)")

            let geCols = try Row.fetchAll(db, sql: "PRAGMA table_info(git_events)")
            let geNames = Set(geCols.compactMap { ($0["name"] as? String) })
            if !geNames.contains("title") {
                try db.execute(sql: "ALTER TABLE git_events ADD COLUMN title TEXT")
            }

            let ftsCount = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages_fts") ?? 0
            let msgCount = try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM messages") ?? 0
            if msgCount > 0 && ftsCount < msgCount / 2 {
                // Direct re-insert is more reliable than FTS5 'rebuild' for
                // external-content tables when triggers can't be trusted.
                try db.execute(sql: "DELETE FROM messages_fts")
                try db.execute(sql: """
                    INSERT INTO messages_fts(rowid, content_redacted)
                    SELECT id, content_redacted FROM messages
                    WHERE content_redacted IS NOT NULL
                    """)
            }
        }
    }

    public static func defaultPath() throws -> String {
        let fm = FileManager.default
        guard let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            throw StorageError.appSupportUnavailable
        }
        let dir = base.appendingPathComponent("Tokscale", isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("tokscale.db").path
    }
}

public enum Boot {
    public static func open(path: String? = nil) throws -> AppDB {
        let resolvedPath = try path ?? AppDB.defaultPath()
        let db = try AppDB(path: resolvedPath)
        // Prefer the main .app bundle (Contents/Resources/schema.sql), fall
        // back to the SPM module bundle for tests and `swift run`.
        let url = Bundle.main.url(forResource: "schema", withExtension: "sql")
            ?? Bundle.module.url(forResource: "schema", withExtension: "sql")
        guard let url else {
            throw StorageError.schemaMissing
        }
        try db.migrate(schemaURL: url)
        return db
    }
}
