import Foundation
import CryptoKit
import Core
import Storage
import GRDB
import Parsers

public enum Hashing {
    public static func sha256(_ input: String) -> String {
        let data = Data(input.utf8)
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    public static func normalizeArgsJSON(_ raw: String) -> String {
        guard let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) else { return raw }
        let sorted = sortKeys(obj)
        guard let out = try? JSONSerialization.data(withJSONObject: sorted, options: [.sortedKeys]) else { return raw }
        return String(data: out, encoding: .utf8) ?? raw
    }

    private static func sortKeys(_ value: Any) -> Any {
        if let arr = value as? [Any] { return arr.map(sortKeys) }
        if let dict = value as? [String: Any] {
            var out: [String: Any] = [:]
            for k in dict.keys.sorted() { out[k] = sortKeys(dict[k]!) }
            return out
        }
        return value
    }

    private static let targetKeys: [String: [String]] = [
        "Read": ["file_path", "path"],
        "Write": ["file_path", "path"],
        "Edit": ["file_path", "path"],
        "Grep": ["path"],
        "Glob": ["path"],
        "NotebookEdit": ["notebook_path"],
    ]

    public static func extractTargetPath(toolName: String, argsJSON: String) -> String? {
        let keys = targetKeys[toolName] ?? ["file_path", "path"]
        guard let data = argsJSON.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        for k in keys {
            if let s = obj[k] as? String { return s }
        }
        return nil
    }
}

public struct MessageRecorder: Sendable {
    public let db: AppDB
    public let redactor: Redactor

    public init(db: AppDB, redactor: Redactor) {
        self.db = db
        self.redactor = redactor
    }

    @discardableResult
    public func record(message: ParsedMessage) throws -> Int64 {
        let redacted = redactor.apply(message.content)
        let hash = Hashing.sha256(redacted)
        return try db.queue.write { db in
            try db.execute(sql: """
                INSERT OR IGNORE INTO messages
                  (session_id, turn_index, role, content_hash, content_redacted,
                   input_tokens, output_tokens, cache_read, cache_write,
                   thinking_tokens, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                """,
                arguments: [
                    message.sessionId, message.turnIndex, message.role.rawValue,
                    hash, redacted,
                    message.inputTokens ?? 0, message.outputTokens ?? 0,
                    message.cacheRead ?? 0, message.cacheWrite ?? 0,
                    message.thinkingTokens ?? 0,
                    Int(message.createdAt.timeIntervalSince1970 * 1000),
                ])
            return db.lastInsertedRowID
        }
    }

    public func record(toolCall: ParsedToolCall, messageId: Int64) throws {
        let normalized = Hashing.normalizeArgsJSON(toolCall.argsJSON)
        let redacted = redactor.apply(normalized)
        let hash = Hashing.sha256(redacted)
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO tool_calls
                  (message_id, session_id, tool_name, args_hash, args_json,
                   target_path, succeeded, tokens_returned, created_at)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                arguments: [
                    messageId, toolCall.sessionId, toolCall.toolName,
                    hash, redacted,
                    toolCall.targetPath ?? Hashing.extractTargetPath(toolName: toolCall.toolName, argsJSON: toolCall.argsJSON),
                    toolCall.succeeded.map { $0 ? 1 : 0 },
                    toolCall.tokensReturned ?? 0,
                    Int(toolCall.createdAt.timeIntervalSince1970 * 1000),
                ])
        }
    }
}
