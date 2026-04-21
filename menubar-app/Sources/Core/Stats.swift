import Foundation

public struct DayStats: Sendable, Hashable {
    public var date: String
    public var costMillicents: Int
    public var inputTokens: Int
    public var outputTokens: Int
    public var sessionCount: Int
    public init(date: String, costMillicents: Int = 0, inputTokens: Int = 0,
                outputTokens: Int = 0, sessionCount: Int = 0) {
        self.date = date
        self.costMillicents = costMillicents
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.sessionCount = sessionCount
    }
}

public struct ModelStats: Sendable, Hashable, Identifiable {
    public var model: String
    public var costMillicents: Int
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheReadTokens: Int
    public var cacheWriteTokens: Int
    public var sessionCount: Int
    public var id: String { model }
    public init(model: String, costMillicents: Int = 0, inputTokens: Int = 0,
                outputTokens: Int = 0, cacheReadTokens: Int = 0,
                cacheWriteTokens: Int = 0, sessionCount: Int = 0) {
        self.model = model
        self.costMillicents = costMillicents
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cacheReadTokens = cacheReadTokens
        self.cacheWriteTokens = cacheWriteTokens
        self.sessionCount = sessionCount
    }
}

public struct ToolStats: Sendable, Hashable, Identifiable {
    public var tool: Tool
    public var costMillicents: Int
    public var sessionCount: Int
    public var id: String { tool.rawValue }
    public init(tool: Tool, costMillicents: Int = 0, sessionCount: Int = 0) {
        self.tool = tool
        self.costMillicents = costMillicents
        self.sessionCount = sessionCount
    }
}

public struct RepoStats: Sendable, Hashable, Identifiable {
    public var repo: String
    public var costMillicents: Int
    public var sessionCount: Int
    public var models: [String]
    public var id: String { repo }
    public init(repo: String, costMillicents: Int = 0, sessionCount: Int = 0,
                models: [String] = []) {
        self.repo = repo
        self.costMillicents = costMillicents
        self.sessionCount = sessionCount
        self.models = models
    }
}

public struct AllTimeStats: Sendable, Hashable {
    public var costMillicents: Int
    public var sessionCount: Int
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheReadTokens: Int
    public var cacheWriteTokens: Int
    public var uniqueModels: Int
    public var uniqueRepos: Int
    public var activeDays: Int
    public var cacheReuseRatio: Double
    public init() {
        self.costMillicents = 0
        self.sessionCount = 0
        self.inputTokens = 0
        self.outputTokens = 0
        self.cacheReadTokens = 0
        self.cacheWriteTokens = 0
        self.uniqueModels = 0
        self.uniqueRepos = 0
        self.activeDays = 0
        self.cacheReuseRatio = 0
    }
}

/// One row = one actual session (a full conversation), aggregated from the
/// per-turn `Session` records that share the same `conversationId`.
public struct SessionSummary: Sendable, Hashable, Identifiable {
    public var id: String            // conversationId
    public var tool: Tool
    public var primaryModel: String  // model with the most turns in this convo
    public var models: [String]      // distinct models used
    public var turnCount: Int
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheReadTokens: Int
    public var cacheWriteTokens: Int
    public var costMillicents: Int
    public var gitRepo: String?
    public var gitBranch: String?
    public var cwd: String?
    public var startedAt: Date
    public var endedAt: Date
    public init(id: String, tool: Tool, primaryModel: String, models: [String],
                turnCount: Int, inputTokens: Int, outputTokens: Int,
                cacheReadTokens: Int, cacheWriteTokens: Int,
                costMillicents: Int, gitRepo: String?, gitBranch: String?,
                cwd: String?, startedAt: Date, endedAt: Date) {
        self.id = id; self.tool = tool
        self.primaryModel = primaryModel; self.models = models
        self.turnCount = turnCount
        self.inputTokens = inputTokens; self.outputTokens = outputTokens
        self.cacheReadTokens = cacheReadTokens; self.cacheWriteTokens = cacheWriteTokens
        self.costMillicents = costMillicents
        self.gitRepo = gitRepo; self.gitBranch = gitBranch; self.cwd = cwd
        self.startedAt = startedAt; self.endedAt = endedAt
    }
    public var durationSeconds: TimeInterval { endedAt.timeIntervalSince(startedAt) }
}

public struct TodayDetail: Sendable, Hashable {
    public var costMillicents: Int
    public var sessionCount: Int
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheReadTokens: Int
    public var cacheWriteTokens: Int
    public var models: [ModelStats]
    public var tools: [ToolStats]
    public var repos: [RepoStats]
    public var hourly: [Int]
    public var firstSession: Date?
    public var lastSession: Date?
    public init() {
        self.costMillicents = 0
        self.sessionCount = 0
        self.inputTokens = 0
        self.outputTokens = 0
        self.cacheReadTokens = 0
        self.cacheWriteTokens = 0
        self.models = []
        self.tools = []
        self.repos = []
        self.hourly = Array(repeating: 0, count: 24)
        self.firstSession = nil
        self.lastSession = nil
    }
}
