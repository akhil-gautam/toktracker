import Foundation
import Core
import Storage

public struct ParserRegistry: Sendable {
    public let parsers: [any SessionParser]

    public static let `default` = ParserRegistry(parsers: [
        ClaudeCodeParser(),
        CodexParser(),
        OpencodeParser(),
        GeminiParser(),
    ])

    public func parser(for url: URL) -> (any SessionParser)? {
        let path = url.path
        if path.contains("/.claude/projects"), url.pathExtension == "jsonl" {
            return parsers.first { $0.tool == .claudeCode }
        }
        if path.contains("/.codex/sessions"), url.pathExtension == "jsonl" {
            return parsers.first { $0.tool == .codex }
        }
        if path.contains("/opencode.db") {
            return parsers.first { $0.tool == .opencode }
        }
        if path.contains("/.gemini/tmp"), url.pathExtension == "json" {
            return parsers.first { $0.tool == .geminiCli }
        }
        return nil
    }

    public func watchDirectories() -> [URL] {
        parsers.map { $0.watchDirectory }
    }
}

/// Resolves a working directory to an "owner/repo" slug by shelling out to
/// `git config --get remote.origin.url`. Results are memoized per cwd so the
/// parser/backfill path stays cheap across thousands of sessions.
public final class GitRepoResolver: @unchecked Sendable {
    public static let shared = GitRepoResolver()

    private let queue = DispatchQueue(label: "tokscale.gitrepo")
    private var cache: [String: String?] = [:]

    public init() {}

    public func slug(forCwd cwd: String?) -> String? {
        guard let cwd, !cwd.isEmpty else { return nil }
        return queue.sync {
            if let cached = cache[cwd] { return cached }
            let url = runGitOriginURL(cwd: cwd)
            let slug = url.flatMap(Self.extractRepo)
            cache[cwd] = slug
            return slug
        }
    }

    private func runGitOriginURL(cwd: String) -> String? {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        guard fm.fileExists(atPath: cwd, isDirectory: &isDir), isDir.boolValue else { return nil }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = ["-C", cwd, "config", "--get", "remote.origin.url"]
        let out = Pipe(); let err = Pipe()
        process.standardOutput = out
        process.standardError = err
        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            let data = out.fileHandleForReading.readDataToEndOfFile()
            let raw = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return (raw?.isEmpty ?? true) ? nil : raw
        } catch {
            return nil
        }
    }

    private static func extractRepo(_ url: String) -> String? {
        let pattern = #"[:/]([^/]+/[^/]+?)(?:\.git)?$"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(url.startIndex..., in: url)
        guard let match = regex.firstMatch(in: url, range: range),
              let r = Range(match.range(at: 1), in: url) else { return nil }
        return String(url[r])
    }
}

public struct CursorStore: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func get(_ path: String) throws -> Int {
        try db.queue.read { db in
            let key = "cursor:\(path)"
            let config: String? = try String.fetchOne(db,
                sql: "SELECT config_json FROM feature_flags WHERE key = ?",
                arguments: [key])
            return Int(config ?? "") ?? 0
        }
    }

    public func set(_ path: String, offset: Int) throws {
        try db.queue.write { db in
            let key = "cursor:\(path)"
            try db.execute(sql: """
                INSERT INTO feature_flags (key, enabled, config_json) VALUES (?,1,?)
                ON CONFLICT(key) DO UPDATE SET config_json=excluded.config_json
                """, arguments: [key, String(offset)])
        }
    }
}
