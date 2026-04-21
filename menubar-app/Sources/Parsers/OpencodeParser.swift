import Foundation
import Core
import GRDB

public struct OpencodeParser: SessionParser {
    public let tool: Tool = .opencode
    public var watchDirectory: URL {
        ParserUtil.home.appendingPathComponent(".local/share/opencode")
    }

    public init() {}

    public func discover() throws -> [URL] {
        let db = watchDirectory.appendingPathComponent("opencode.db")
        return FileManager.default.fileExists(atPath: db.path) ? [db] : []
    }

    /// OpenCode stores sessions in SQLite. `fromOffset` is interpreted as a
    /// Unix-millisecond timestamp cursor, not a byte offset.
    public func parse(path: URL, fromOffset: Int) async throws -> ParseResult {
        var config = Configuration()
        config.readonly = true
        let dbQueue = try DatabaseQueue(path: path.path, configuration: config)

        let rows = try await dbQueue.read { db -> [Row] in
            try Row.fetchAll(db, sql: """
                SELECT m.id, m.session_id, m.time_created, m.data, s.directory
                FROM message m JOIN session s ON s.id = m.session_id
                WHERE m.time_created > ?
                ORDER BY m.time_created ASC
                """, arguments: [fromOffset])
        }

        var sessions: [Session] = []
        var maxTimestamp = fromOffset

        for row in rows {
            guard let dataJSON: String = row["data"],
                  let json = dataJSON.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: json) as? [String: Any],
                  (obj["role"] as? String) == "assistant",
                  let tokens = obj["tokens"] as? [String: Any]
            else { continue }

            let input = (tokens["input"] as? Int) ?? 0
            let output = (tokens["output"] as? Int) ?? 0
            let reasoning = (tokens["reasoning"] as? Int) ?? 0
            let cache = tokens["cache"] as? [String: Any]
            let cacheRead = (cache?["read"] as? Int) ?? 0
            let cacheWrite = (cache?["write"] as? Int) ?? 0
            let costDollars = (obj["cost"] as? Double) ?? 0
            let timeCreated = row["time_created"] as Int
            let turnId: String = row["id"]
            let convId: String = row["session_id"]
            let cwd: String? = row["directory"]
            let model = (obj["modelID"] as? String) ?? "unknown"
            let provider = (obj["providerID"] as? String) ?? "unknown"

            sessions.append(Session(
                id: "oc-\(turnId)", conversationId: "oc-\(convId)",
                tool: .opencode, model: model, provider: provider,
                inputTokens: input, outputTokens: output,
                cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
                reasoningTokens: reasoning,
                costMillicents: Int((costDollars * 100_000).rounded()),
                cwd: cwd,
                startedAt: Date(timeIntervalSince1970: Double(timeCreated) / 1000)))

            if timeCreated > maxTimestamp { maxTimestamp = timeCreated }
        }

        return ParseResult(sessions: sessions, newOffset: maxTimestamp)
    }
}
