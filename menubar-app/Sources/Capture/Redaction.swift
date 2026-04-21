import Foundation
import Core
import Storage
import GRDB

public struct RedactionRule: Sendable, Hashable {
    public var id: Int64?
    public var pattern: String
    public var replacement: String
    public var enabled: Bool
    public var builtin: Bool

    public init(id: Int64? = nil, pattern: String, replacement: String,
                enabled: Bool = true, builtin: Bool = false) {
        self.id = id
        self.pattern = pattern
        self.replacement = replacement
        self.enabled = enabled
        self.builtin = builtin
    }
}

public enum BuiltinRedactionRules {
    public static let all: [RedactionRule] = [
        .init(pattern: "AKIA[0-9A-Z]{16}", replacement: "[REDACTED_AWS_AK]", builtin: true),
        .init(pattern: "ghp_[A-Za-z0-9]{20,}", replacement: "[REDACTED_GH_TOKEN]", builtin: true),
        .init(pattern: "github_pat_[A-Za-z0-9_]{20,}", replacement: "[REDACTED_GH_TOKEN]", builtin: true),
        .init(pattern: "sk-[A-Za-z0-9_-]{20,}", replacement: "[REDACTED_API_KEY]", builtin: true),
        .init(pattern: "xox[baprs]-[A-Za-z0-9-]{10,}", replacement: "[REDACTED_SLACK]", builtin: true),
        .init(pattern: "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
              replacement: "[REDACTED_PRIVATE_KEY]", builtin: true),
        .init(pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
              replacement: "[REDACTED_EMAIL]", builtin: true),
        .init(pattern: "\\b\\+?\\d{1,2}[\\s.-]?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b",
              replacement: "[REDACTED_PHONE]", builtin: true),
    ]
}

public final class Redactor: @unchecked Sendable {
    private let compiled: [(regex: NSRegularExpression, replacement: String)]

    public init(rules: [RedactionRule]) {
        self.compiled = rules.compactMap { rule in
            guard rule.enabled,
                  let regex = try? NSRegularExpression(pattern: rule.pattern, options: [.dotMatchesLineSeparators]) else { return nil }
            return (regex, rule.replacement)
        }
    }

    public func apply(_ text: String) -> String {
        var output = text
        for (regex, replacement) in compiled {
            let range = NSRange(output.startIndex..., in: output)
            output = regex.stringByReplacingMatches(in: output, range: range, withTemplate: replacement)
        }
        return output
    }
}

public struct RedactionRulesRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func all() throws -> [RedactionRule] {
        try db.queue.read { db in
            try Row.fetchAll(db, sql: "SELECT * FROM redaction_rules").compactMap { row in
                guard let pattern: String = row["pattern"],
                      let replacement: String = row["replacement"] else { return nil }
                let id: Int64 = row["id"]
                let enabled: Int = row["enabled"]
                let builtin: Int = row["builtin"]
                return RedactionRule(
                    id: id,
                    pattern: pattern, replacement: replacement,
                    enabled: enabled == 1,
                    builtin: builtin == 1)
            }
        }
    }

    public func seedBuiltinsIfNeeded() throws {
        let existing = try all().filter { $0.builtin }
        let existingPatterns = Set(existing.map { $0.pattern })
        for rule in BuiltinRedactionRules.all where !existingPatterns.contains(rule.pattern) {
            try insert(rule)
        }
    }

    public func insert(_ rule: RedactionRule) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO redaction_rules (pattern, replacement, enabled, builtin, created_at)
                VALUES (?,?,?,?,?)
                """,
                arguments: [rule.pattern, rule.replacement,
                            rule.enabled ? 1 : 0, rule.builtin ? 1 : 0,
                            Int(Date().timeIntervalSince1970 * 1000)])
        }
    }

    public func setEnabled(id: Int64, enabled: Bool) throws {
        try db.queue.write { db in
            try db.execute(sql: "UPDATE redaction_rules SET enabled = ? WHERE id = ?",
                arguments: [enabled ? 1 : 0, id])
        }
    }
}
