import Foundation
import Core

public struct ParseResult: Sendable {
    public var sessions: [Session]
    public var messages: [ParsedMessage]
    public var toolCalls: [ParsedToolCall]
    public var newOffset: Int
    public init(sessions: [Session] = [], messages: [ParsedMessage] = [],
                toolCalls: [ParsedToolCall] = [], newOffset: Int = 0) {
        self.sessions = sessions
        self.messages = messages
        self.toolCalls = toolCalls
        self.newOffset = newOffset
    }
}

public struct ParsedMessage: Sendable {
    public var sessionId: String
    public var turnIndex: Int
    public var role: Role
    public var content: String
    public var inputTokens: Int?
    public var outputTokens: Int?
    public var cacheRead: Int?
    public var cacheWrite: Int?
    public var thinkingTokens: Int?
    public var createdAt: Date

    public enum Role: String, Sendable { case user, assistant, system, tool }

    public init(sessionId: String, turnIndex: Int, role: Role, content: String,
                inputTokens: Int? = nil, outputTokens: Int? = nil,
                cacheRead: Int? = nil, cacheWrite: Int? = nil,
                thinkingTokens: Int? = nil, createdAt: Date) {
        self.sessionId = sessionId
        self.turnIndex = turnIndex
        self.role = role
        self.content = content
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cacheRead = cacheRead
        self.cacheWrite = cacheWrite
        self.thinkingTokens = thinkingTokens
        self.createdAt = createdAt
    }
}

public struct ParsedToolCall: Sendable {
    public var sessionId: String
    public var turnIndex: Int
    public var toolName: String
    public var argsJSON: String
    public var targetPath: String?
    public var succeeded: Bool?
    public var tokensReturned: Int?
    public var createdAt: Date

    public init(sessionId: String, turnIndex: Int, toolName: String,
                argsJSON: String, targetPath: String? = nil,
                succeeded: Bool? = nil, tokensReturned: Int? = nil,
                createdAt: Date) {
        self.sessionId = sessionId
        self.turnIndex = turnIndex
        self.toolName = toolName
        self.argsJSON = argsJSON
        self.targetPath = targetPath
        self.succeeded = succeeded
        self.tokensReturned = tokensReturned
        self.createdAt = createdAt
    }
}

public protocol SessionParser: Sendable {
    var tool: Tool { get }
    var watchDirectory: URL { get }
    func discover() throws -> [URL]
    func parse(path: URL, fromOffset: Int) async throws -> ParseResult
}

public enum ParserUtil {
    static let home: URL = FileManager.default.homeDirectoryForCurrentUser

    private static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// Returns nil if `s` is missing or not parseable. Never defaults to `Date()`
    /// because that causes old rows to silently masquerade as "now".
    public static func parseISO(_ s: String?) -> Date? {
        guard let s else { return nil }
        return isoFractional.date(from: s) ?? isoPlain.date(from: s)
    }

    public static func listFiles(in directory: URL, matchingExtensions exts: [String]) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else { return [] }

        var results: [URL] = []
        for case let url as URL in enumerator {
            if exts.contains(url.pathExtension), (try? url.resourceValues(forKeys: [.isRegularFileKey]))?.isRegularFile == true {
                results.append(url)
            }
        }
        return results
    }
}
