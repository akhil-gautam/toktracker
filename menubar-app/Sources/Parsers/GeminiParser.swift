import Foundation
import Core
import CryptoKit

public struct GeminiParser: SessionParser {
    public let tool: Tool = .geminiCli
    public var watchDirectory: URL {
        ParserUtil.home.appendingPathComponent(".gemini/tmp")
    }

    public init() {}

    public func discover() throws -> [URL] {
        let dir = watchDirectory
        guard FileManager.default.fileExists(atPath: dir.path) else { return [] }
        return ParserUtil.listFiles(in: dir, matchingExtensions: ["json"])
            .filter { $0.path.contains("/chats/") }
    }

    public func parse(path: URL, fromOffset: Int) async throws -> ParseResult {
        let attrs = try FileManager.default.attributesOfItem(atPath: path.path)
        let size = (attrs[.size] as? Int) ?? 0
        if fromOffset >= size { return ParseResult(newOffset: fromOffset) }

        let data = try Data(contentsOf: path)
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let msgs = obj["messages"] as? [[String: Any]] else {
            return ParseResult(newOffset: size)
        }

        let model = "gemini-2.5-pro"
        let calculator = CostCalculator.shared
        var sessions: [Session] = []
        var cumulativeInput = ""
        let convId = "gem-" + Self.sha1(path.lastPathComponent).prefix(16)

        for (idx, msg) in msgs.enumerated() {
            let type = msg["type"] as? String ?? ""
            let text = Self.extractText(msg["content"])
            if type == "user" {
                cumulativeInput += text + "\n"
                continue
            }
            guard type == "assistant" else { continue }
            guard let timestamp = ParserUtil.parseISO(msg["timestamp"] as? String) else { continue }

            let inputTokens = max(1, cumulativeInput.count / 4)
            let outputTokens = max(1, text.count / 4)
            cumulativeInput += text + "\n"

            let cost = calculator.cost(
                model: model, inputTokens: inputTokens, outputTokens: outputTokens)
            sessions.append(Session(
                id: "\(convId)-\(idx)", conversationId: String(convId),
                tool: .geminiCli, model: model, provider: "google",
                inputTokens: inputTokens, outputTokens: outputTokens,
                costMillicents: cost,
                startedAt: timestamp,
                estimated: true))
        }

        return ParseResult(sessions: sessions, newOffset: size)
    }

    private static func extractText(_ value: Any?) -> String {
        if let s = value as? String { return s }
        if let arr = value as? [[String: Any]] {
            return arr.compactMap { $0["text"] as? String }.joined(separator: "\n")
        }
        return ""
    }

    private static func sha1(_ s: String) -> String {
        let data = Data(s.utf8)
        let hash = Insecure.SHA1.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}
