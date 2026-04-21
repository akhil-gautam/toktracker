import Foundation
import Core

public struct CodexParser: SessionParser {
    public let tool: Tool = .codex
    public var watchDirectory: URL {
        ParserUtil.home.appendingPathComponent(".codex/sessions")
    }

    public init() {}

    public func discover() throws -> [URL] {
        let dir = watchDirectory
        guard FileManager.default.fileExists(atPath: dir.path) else { return [] }
        return ParserUtil.listFiles(in: dir, matchingExtensions: ["jsonl"])
    }

    public func parse(path: URL, fromOffset: Int) async throws -> ParseResult {
        let attrs = try FileManager.default.attributesOfItem(atPath: path.path)
        let size = (attrs[.size] as? Int) ?? 0
        if fromOffset >= size { return ParseResult(newOffset: fromOffset) }

        let handle = try FileHandle(forReadingFrom: path)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(fromOffset))
        let data = handle.readDataToEndOfFile()
        guard let text = String(data: data, encoding: .utf8) else {
            return ParseResult(newOffset: size)
        }

        var sessions: [Session] = []
        var sessionId: String?
        var cwd: String?
        var gitRepo: String?
        var gitBranch: String?
        var provider = "openai"
        var currentModel = "unknown"
        let calculator = CostCalculator.shared

        for rawLine in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = String(rawLine)
            guard let lineData = line.data(using: .utf8) else { continue }
            guard let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else { continue }
            let kind = obj["type"] as? String
            let payload = obj["payload"] as? [String: Any]
            guard let timestamp = ParserUtil.parseISO(obj["timestamp"] as? String) else {
                // Skip events with unparseable timestamps instead of defaulting to `now`,
                // which would make old rows masquerade as today's activity.
                continue
            }

            if kind == "session_meta", let p = payload {
                sessionId = p["id"] as? String
                cwd = p["cwd"] as? String
                provider = (p["model_provider"] as? String) ?? "openai"
                if let git = p["git"] as? [String: Any] {
                    if let url = git["repository_url"] as? String {
                        gitRepo = Self.extractRepo(url)
                    }
                    gitBranch = git["branch"] as? String
                }
            }

            if kind == "turn_context", let model = payload?["model"] as? String {
                currentModel = model
            }

            if kind == "event_msg",
               (payload?["type"] as? String) == "token_count",
               let info = payload?["info"] as? [String: Any],
               let usage = info["last_token_usage"] as? [String: Any] {
                let inputTokens = (usage["input_tokens"] as? Int) ?? 0
                let cached = (usage["cached_input_tokens"] as? Int) ?? 0
                let outputTokens = (usage["output_tokens"] as? Int) ?? 0
                let reasoning = (usage["reasoning_output_tokens"] as? Int) ?? 0
                let cost = calculator.cost(
                    model: currentModel,
                    inputTokens: max(0, inputTokens - cached),
                    outputTokens: outputTokens,
                    cacheReadTokens: cached,
                    cacheWriteTokens: 0)
                let convId = sessionId ?? path.lastPathComponent
                let turnId = "codex-\(convId)-\(sessions.count)"
                sessions.append(Session(
                    id: turnId, conversationId: convId,
                    tool: .codex, model: currentModel, provider: provider,
                    inputTokens: inputTokens, outputTokens: outputTokens,
                    cacheReadTokens: cached, cacheWriteTokens: 0,
                    reasoningTokens: reasoning, costMillicents: cost,
                    cwd: cwd, gitRepo: gitRepo, gitBranch: gitBranch,
                    startedAt: timestamp))
            }
        }

        return ParseResult(sessions: sessions, newOffset: size)
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
