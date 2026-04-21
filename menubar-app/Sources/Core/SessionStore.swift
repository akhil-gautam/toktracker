import Foundation

public final class SessionStore: @unchecked Sendable {
    private var sessions: [String: Session] = [:]
    private var cached: Aggregates?

    public init() {}

    public func add(_ newSessions: [Session]) {
        for s in newSessions { sessions[s.id] = s }
        cached = nil
    }

    public func reset(_ newSessions: [Session]) {
        sessions.removeAll(keepingCapacity: true)
        for s in newSessions { sessions[s.id] = s }
        cached = nil
    }

    public func all() -> [Session] { Array(sessions.values) }
    public func count() -> Int { sessions.count }
    /// All turn-rows that belong to a given conversation, chronologically sorted.
    public func turns(for conversationId: String) -> [Session] {
        sessions.values
            .filter { $0.conversationId == conversationId }
            .sorted { $0.startedAt < $1.startedAt }
    }

    public struct Aggregates: Sendable {
        public var allTime: AllTimeStats = AllTimeStats()
        public var todayDetail: TodayDetail = TodayDetail()
        public var weekTotal: Int = 0
        public var models: [ModelStats] = []
        public var tools: [ToolStats] = []
        public var repos: [RepoStats] = []
        public var dailyStats: [DayStats] = []
        public var modelTrends: [String: [Int]] = [:]
        public var recentSessions: [SessionSummary] = []
        public init() {}
    }

    public func aggregates() -> Aggregates {
        if let cached { return cached }

        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        func dk(_ d: Date) -> String {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            return f.string(from: d)
        }
        func daysAgo(_ n: Int) -> Date {
            cal.date(byAdding: .day, value: -n, to: today) ?? today
        }
        let todayKey = dk(today)
        let weekStart = daysAgo(6)
        let windowStart = daysAgo(89)

        var agg = Aggregates()
        var modelMap: [String: ModelStats] = [:]
        var toolMap: [Tool: ToolStats] = [:]
        var repoMap: [String: RepoStats] = [:]
        var dailyMap: [String: DayStats] = [:]
        var modelDailyMap: [String: [String: Int]] = [:]
        var todayHourly = Array(repeating: 0, count: 24)
        var todayModels: [String: ModelStats] = [:]
        var todayTools: [Tool: ToolStats] = [:]
        var todayRepos: [String: RepoStats] = [:]
        var todayFirst: Date?
        var todayLast: Date?
        var todayCost = 0, todayIn = 0, todayOut = 0
        var todayCacheRead = 0, todayCacheWrite = 0
        var allTimeCost = 0, allTimeIn = 0, allTimeOut = 0
        var allTimeCacheRead = 0, allTimeCacheWrite = 0
        var weekTotal = 0
        // Count unique conversations, not per-turn rows.
        var allTimeConvos: Set<String> = []
        var todayConvos: Set<String> = []
        var dailyConvoSets: [String: Set<String>] = [:]

        for s in sessions.values {
            allTimeCost += s.costMillicents
            allTimeIn += s.inputTokens
            allTimeOut += s.outputTokens
            allTimeCacheRead += s.cacheReadTokens
            allTimeCacheWrite += s.cacheWriteTokens
            allTimeConvos.insert(s.conversationId)
            let startDay = cal.startOfDay(for: s.startedAt)
            let key = dk(startDay)
            dailyConvoSets[key, default: []].insert(s.conversationId)

            if key == todayKey {
                todayCost += s.costMillicents
                todayIn += s.inputTokens
                todayOut += s.outputTokens
                todayCacheRead += s.cacheReadTokens
                todayCacheWrite += s.cacheWriteTokens
                todayConvos.insert(s.conversationId)
                let hour = cal.component(.hour, from: s.startedAt)
                todayHourly[hour] += s.costMillicents
                if todayFirst == nil || s.startedAt < todayFirst! { todayFirst = s.startedAt }
                if todayLast == nil || s.startedAt > todayLast! { todayLast = s.startedAt }
                accumulateModel(&todayModels, key: s.model, session: s)
                accumulateTool(&todayTools, key: s.tool, session: s)
                if let repo = s.gitRepo {
                    accumulateRepo(&todayRepos, key: repo, session: s)
                }
            }

            if startDay >= weekStart { weekTotal += s.costMillicents }

            accumulateModel(&modelMap, key: s.model, session: s)
            accumulateTool(&toolMap, key: s.tool, session: s)
            if let repo = s.gitRepo {
                accumulateRepo(&repoMap, key: repo, session: s)
            }

            var entry = dailyMap[key] ?? DayStats(date: key)
            entry.costMillicents += s.costMillicents
            entry.inputTokens += s.inputTokens
            entry.outputTokens += s.outputTokens
            // sessionCount resolved after the loop using dailyConvoSets
            dailyMap[key] = entry

            if startDay >= windowStart {
                var perModel = modelDailyMap[s.model] ?? [:]
                perModel[key, default: 0] += s.costMillicents
                modelDailyMap[s.model] = perModel
            }
        }

        // Resolve per-day session count = number of distinct conversations active that day
        for (k, convos) in dailyConvoSets {
            if var entry = dailyMap[k] {
                entry.sessionCount = convos.count
                dailyMap[k] = entry
            }
        }
        var daily: [DayStats] = []
        for i in stride(from: 89, through: 0, by: -1) {
            let d = daysAgo(i)
            let k = dk(d)
            daily.append(dailyMap[k] ?? DayStats(date: k))
        }

        var trends: [String: [Int]] = [:]
        for (model, perDay) in modelDailyMap {
            var arr: [Int] = []
            for i in stride(from: 89, through: 0, by: -1) {
                arr.append(perDay[dk(daysAgo(i))] ?? 0)
            }
            trends[model] = arr
        }

        let totalIn = allTimeCacheRead + allTimeCacheWrite + allTimeIn
        let reuse = totalIn > 0 ? Double(allTimeCacheRead) / Double(totalIn) : 0

        agg.allTime = AllTimeStats()
        agg.allTime.costMillicents = allTimeCost
        agg.allTime.sessionCount = allTimeConvos.count
        agg.allTime.inputTokens = allTimeIn
        agg.allTime.outputTokens = allTimeOut
        agg.allTime.cacheReadTokens = allTimeCacheRead
        agg.allTime.cacheWriteTokens = allTimeCacheWrite
        agg.allTime.uniqueModels = modelMap.count
        agg.allTime.uniqueRepos = repoMap.count
        agg.allTime.activeDays = dailyMap.count
        agg.allTime.cacheReuseRatio = reuse

        var todayDetail = TodayDetail()
        todayDetail.costMillicents = todayCost
        todayDetail.sessionCount = todayConvos.count
        todayDetail.inputTokens = todayIn
        todayDetail.outputTokens = todayOut
        todayDetail.cacheReadTokens = todayCacheRead
        todayDetail.cacheWriteTokens = todayCacheWrite
        todayDetail.hourly = todayHourly
        todayDetail.firstSession = todayFirst
        todayDetail.lastSession = todayLast
        todayDetail.models = todayModels.values.sorted { $0.costMillicents > $1.costMillicents }
        todayDetail.tools = todayTools.values.sorted { $0.costMillicents > $1.costMillicents }
        todayDetail.repos = todayRepos.values.sorted { $0.costMillicents > $1.costMillicents }
        agg.todayDetail = todayDetail

        agg.weekTotal = weekTotal
        agg.models = modelMap.values.sorted { $0.costMillicents > $1.costMillicents }
        agg.tools = toolMap.values.sorted { $0.costMillicents > $1.costMillicents }
        agg.repos = repoMap.values.sorted { $0.costMillicents > $1.costMillicents }
        agg.dailyStats = daily
        agg.modelTrends = trends
        agg.recentSessions = Self.groupConversations(sessions.values)

        cached = agg
        return agg
    }

    /// Group per-turn `Session` rows into one `SessionSummary` per
    /// `conversationId`. The primary model is the one that ran the most turns;
    /// tokens/cost/turn count are summed across every turn in the conversation.
    static func groupConversations<S: Sequence>(_ all: S) -> [SessionSummary]
        where S.Element == Session
    {
        var grouped: [String: [Session]] = [:]
        for s in all { grouped[s.conversationId, default: []].append(s) }

        var out: [SessionSummary] = []
        out.reserveCapacity(grouped.count)
        for (convId, turns) in grouped {
            guard !turns.isEmpty else { continue }
            var modelCounts: [String: Int] = [:]
            var started = turns[0].startedAt
            var ended = turns[0].endedAt ?? turns[0].startedAt
            var input = 0, output = 0, cacheR = 0, cacheW = 0, cost = 0
            var repo: String? = nil, branch: String? = nil, cwd: String? = nil
            let tool = turns[0].tool
            for t in turns {
                modelCounts[t.model, default: 0] += 1
                if t.startedAt < started { started = t.startedAt }
                let te = t.endedAt ?? t.startedAt
                if te > ended { ended = te }
                input += t.inputTokens
                output += t.outputTokens
                cacheR += t.cacheReadTokens
                cacheW += t.cacheWriteTokens
                cost += t.costMillicents
                if repo == nil, let r = t.gitRepo { repo = r }
                if branch == nil, let b = t.gitBranch { branch = b }
                if cwd == nil, let c = t.cwd { cwd = c }
            }
            let primary = modelCounts.max { $0.value < $1.value }?.key ?? turns[0].model
            let distinctModels = Array(modelCounts.keys).sorted()
            out.append(SessionSummary(
                id: convId, tool: tool,
                primaryModel: primary, models: distinctModels,
                turnCount: turns.count,
                inputTokens: input, outputTokens: output,
                cacheReadTokens: cacheR, cacheWriteTokens: cacheW,
                costMillicents: cost,
                gitRepo: repo, gitBranch: branch, cwd: cwd,
                startedAt: started, endedAt: ended))
        }
        return out
            .sorted { $0.endedAt > $1.endedAt }
            .prefix(500)
            .map { $0 }
    }

    private func accumulateModel(_ map: inout [String: ModelStats], key: String, session: Session) {
        var e = map[key] ?? ModelStats(model: key)
        e.costMillicents += session.costMillicents
        e.inputTokens += session.inputTokens
        e.outputTokens += session.outputTokens
        e.cacheReadTokens += session.cacheReadTokens
        e.cacheWriteTokens += session.cacheWriteTokens
        e.sessionCount += 1
        map[key] = e
    }

    private func accumulateTool(_ map: inout [Tool: ToolStats], key: Tool, session: Session) {
        var e = map[key] ?? ToolStats(tool: key)
        e.costMillicents += session.costMillicents
        e.sessionCount += 1
        map[key] = e
    }

    private func accumulateRepo(_ map: inout [String: RepoStats], key: String, session: Session) {
        var e = map[key] ?? RepoStats(repo: key)
        e.costMillicents += session.costMillicents
        e.sessionCount += 1
        if !e.models.contains(session.model) { e.models.append(session.model) }
        map[key] = e
    }
}
