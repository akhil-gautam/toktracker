import Foundation

public enum Tool: String, Codable, Sendable, CaseIterable {
    case claudeCode = "claude_code"
    case codex
    case opencode
    case geminiCli = "gemini_cli"
}

/// One Session row = one assistant turn (billing event). Multiple turns with
/// the same `conversationId` form a single user conversation.
public struct Session: Sendable, Identifiable, Hashable {
    public var id: String
    public var conversationId: String
    public var tool: Tool
    public var model: String
    public var provider: String
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheReadTokens: Int
    public var cacheWriteTokens: Int
    public var reasoningTokens: Int
    public var costMillicents: Int
    public var cwd: String?
    public var gitRepo: String?
    public var gitBranch: String?
    public var startedAt: Date
    public var endedAt: Date?
    public var estimated: Bool
    public var toolUses: [String: Int]

    public init(
        id: String, conversationId: String, tool: Tool, model: String, provider: String,
        inputTokens: Int = 0, outputTokens: Int = 0,
        cacheReadTokens: Int = 0, cacheWriteTokens: Int = 0,
        reasoningTokens: Int = 0, costMillicents: Int = 0,
        cwd: String? = nil, gitRepo: String? = nil, gitBranch: String? = nil,
        startedAt: Date, endedAt: Date? = nil,
        estimated: Bool = false, toolUses: [String: Int] = [:]
    ) {
        self.id = id
        self.conversationId = conversationId
        self.tool = tool
        self.model = model
        self.provider = provider
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cacheReadTokens = cacheReadTokens
        self.cacheWriteTokens = cacheWriteTokens
        self.reasoningTokens = reasoningTokens
        self.costMillicents = costMillicents
        self.cwd = cwd
        self.gitRepo = gitRepo
        self.gitBranch = gitBranch
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.estimated = estimated
        self.toolUses = toolUses
    }
}

public struct ModelPricing: Codable, Sendable, Hashable {
    public let inputPerMillion: Double
    public let outputPerMillion: Double
    public let cacheReadPerMillion: Double
    public let cacheWritePerMillion: Double
}

public enum BudgetScope: String, Codable, Sendable { case global, project, repo }
public enum BudgetPeriod: String, Codable, Sendable { case daily, weekly, monthly }

public struct Budget: Sendable, Identifiable, Hashable {
    public var id: String
    public var scope: BudgetScope
    public var scopeValue: String?
    public var period: BudgetPeriod
    public var limitCents: Int
    public var alertAtPct: Int

    public init(id: String, scope: BudgetScope, scopeValue: String? = nil,
                period: BudgetPeriod, limitCents: Int, alertAtPct: Int = 80) {
        self.id = id
        self.scope = scope
        self.scopeValue = scopeValue
        self.period = period
        self.limitCents = limitCents
        self.alertAtPct = alertAtPct
    }
}

public enum Severity: String, Codable, Sendable, Comparable {
    case info, warn, block
    public static func < (lhs: Severity, rhs: Severity) -> Bool {
        let order: [Severity: Int] = [.info: 0, .warn: 1, .block: 2]
        return (order[lhs] ?? 0) < (order[rhs] ?? 0)
    }
}

public enum Trigger: String, Codable, Sendable {
    case preToolUse = "PreToolUse"
    case postToolUse = "PostToolUse"
    case userPromptSubmit = "UserPromptSubmit"
    case stop = "Stop"
    case gitEvent = "GitEvent"
    case nightly = "Nightly"
}

public enum RuleCategory: String, Codable, Sendable {
    case waste = "A"
    case patterns = "B"
    case forecast = "C"
    case attribution = "D"
}

public struct Detection: Sendable, Identifiable, Hashable {
    public var id: Int64?
    public var ruleId: String
    public var sessionId: String?
    public var trigger: Trigger
    public var severity: Severity
    public var summary: String
    public var detail: String?
    public var createdAt: Date
    public var acknowledgedAt: Date?

    public init(id: Int64? = nil, ruleId: String, sessionId: String? = nil,
                trigger: Trigger, severity: Severity, summary: String,
                detail: String? = nil, createdAt: Date = Date(),
                acknowledgedAt: Date? = nil) {
        self.id = id
        self.ruleId = ruleId
        self.sessionId = sessionId
        self.trigger = trigger
        self.severity = severity
        self.summary = summary
        self.detail = detail
        self.createdAt = createdAt
        self.acknowledgedAt = acknowledgedAt
    }
}

public struct HookDecision: Sendable, Codable {
    public enum Action: String, Codable, Sendable { case allow, warn, block }
    public var action: Action
    public var messages: [String]

    public init(action: Action = .allow, messages: [String] = []) {
        self.action = action
        self.messages = messages
    }
}
