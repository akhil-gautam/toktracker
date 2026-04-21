import Foundation
import Core

public struct ClaudeCodeParser: SessionParser {
    public let tool: Tool = .claudeCode
    public var watchDirectory: URL {
        ParserUtil.home.appendingPathComponent(".claude/projects")
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
        if fromOffset >= size {
            return ParseResult(newOffset: fromOffset)
        }

        let handle = try FileHandle(forReadingFrom: path)
        defer { try? handle.close() }
        try handle.seek(toOffset: UInt64(fromOffset))
        let data = handle.readDataToEndOfFile()
        guard let text = String(data: data, encoding: .utf8) else {
            return ParseResult(newOffset: size)
        }

        // One row per assistant turn (billing event); the `conversationId`
        // groups turns into user-visible conversations.
        var sessions: [Session] = []
        var messages: [ParsedMessage] = []
        var toolCalls: [ParsedToolCall] = []

        var currentSessionId: String?
        var turnIndex = 0
        let calculator = CostCalculator.shared

        for rawLine in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let line = String(rawLine)
            guard line.contains("\"type\"") else { continue }
            guard let lineData = line.data(using: .utf8) else { continue }
            guard let obj = try? JSONSerialization.jsonObject(with: lineData) as? [String: Any] else { continue }

            if let sid = obj["sessionId"] as? String, sid != currentSessionId {
                currentSessionId = sid
                turnIndex = 0
            }

            let type = obj["type"] as? String
            guard let timestamp = ParserUtil.parseISO(obj["timestamp"] as? String) else { continue }

            if type == "user", let sid = currentSessionId,
               let message = obj["message"] as? [String: Any] {
                messages.append(.init(
                    sessionId: sid, turnIndex: turnIndex,
                    role: .user,
                    content: Self.extractText(message["content"]),
                    createdAt: timestamp))
            }

            guard type == "assistant",
                  let sid = currentSessionId,
                  let message = obj["message"] as? [String: Any] else { continue }

            let model = (message["model"] as? String) ?? "unknown"
            let usage = message["usage"] as? [String: Any]
            let inputTokens = (usage?["input_tokens"] as? Int) ?? 0
            let outputTokens = (usage?["output_tokens"] as? Int) ?? 0
            let cacheRead = (usage?["cache_read_input_tokens"] as? Int) ?? 0
            let cacheWrite = (usage?["cache_creation_input_tokens"] as? Int) ?? 0

            if usage != nil {
                let turnId: String
                if let uuid = obj["uuid"] as? String { turnId = "cc-\(uuid)" }
                else { turnId = "cc-\(path.lastPathComponent)-\(sessions.count)" }

                var toolUses: [String: Int] = [:]
                if let content = message["content"] as? [[String: Any]] {
                    for part in content where (part["type"] as? String) == "tool_use" {
                        if let name = part["name"] as? String {
                            toolUses[name, default: 0] += 1
                        }
                    }
                }

                let cost = calculator.cost(
                    model: model,
                    inputTokens: inputTokens,
                    outputTokens: outputTokens,
                    cacheReadTokens: cacheRead,
                    cacheWriteTokens: cacheWrite)

                let cwdStr = obj["cwd"] as? String
                sessions.append(Session(
                    id: turnId, conversationId: sid,
                    tool: .claudeCode, model: model, provider: "anthropic",
                    inputTokens: inputTokens, outputTokens: outputTokens,
                    cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite,
                    costMillicents: cost,
                    cwd: cwdStr,
                    gitRepo: GitRepoResolver.shared.slug(forCwd: cwdStr),
                    gitBranch: obj["gitBranch"] as? String,
                    startedAt: timestamp,
                    toolUses: toolUses))
            }

            messages.append(.init(
                sessionId: sid, turnIndex: turnIndex,
                role: .assistant,
                content: Self.extractText(message["content"]),
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                cacheRead: cacheRead,
                cacheWrite: cacheWrite,
                createdAt: timestamp))

            if let content = message["content"] as? [[String: Any]] {
                for block in content where (block["type"] as? String) == "tool_use" {
                    if let name = block["name"] as? String {
                        let input = block["input"] ?? [:]
                        let argsData = (try? JSONSerialization.data(withJSONObject: input)) ?? Data()
                        let argsJSON = String(data: argsData, encoding: .utf8) ?? "{}"
                        toolCalls.append(.init(
                            sessionId: sid, turnIndex: turnIndex,
                            toolName: name,
                            argsJSON: argsJSON,
                            createdAt: timestamp))
                    }
                }
            }
            turnIndex += 1
        }

        return ParseResult(sessions: sessions, messages: messages, toolCalls: toolCalls, newOffset: size)
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static func parseISO(_ s: String) -> Date? {
        if let d = isoFormatter.date(from: s) { return d }
        let noFrac = ISO8601DateFormatter()
        noFrac.formatOptions = [.withInternetDateTime]
        return noFrac.date(from: s)
    }

    private static func extractText(_ value: Any?) -> String {
        if let s = value as? String { return s }
        if let arr = value as? [[String: Any]] {
            return arr.compactMap { Self.renderBlock($0) }
                .filter { !$0.isEmpty }
                .joined(separator: "\n\n")
        }
        return ""
    }

    private static func renderBlock(_ block: [String: Any]) -> String {
        let type = block["type"] as? String
        switch type {
        case "text":
            return (block["text"] as? String) ?? ""
        case "thinking":
            if let t = block["thinking"] as? String, !t.isEmpty {
                return "[thinking]\n\(t)"
            }
            return ""
        case "tool_use":
            let name = (block["name"] as? String) ?? "tool"
            let input = block["input"] ?? [:]
            let data = (try? JSONSerialization.data(withJSONObject: input, options: [.prettyPrinted])) ?? Data()
            let args = String(data: data, encoding: .utf8) ?? "{}"
            return "[tool_use: \(name)]\n\(args)"
        case "tool_result":
            let idFragment: String = {
                if let id = block["tool_use_id"] as? String {
                    return " (\(id.suffix(8)))"
                }
                return ""
            }()
            return "[tool_result\(idFragment)]\n\(extractText(block["content"]))"
        case "image":
            return "[image]"
        default:
            if let t = block["text"] as? String { return t }
            return ""
        }
    }
}
