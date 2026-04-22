import SwiftUI
import Charts
import Core
import Storage
import Detection
import Hook
import GRDB

// MARK: - Overview

public struct OverviewTab: View {
    @Environment(AppStore.self) private var store
    let range: String
    public init(range: String = "30D") { self.range = range }

    public var body: some View {
        let agg = store.aggregates
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                LiveIndicator(lastRefresh: store.lastRefresh)
                Spacer()
            }
            kpis(agg: agg)
            ActivityHeroSection(range: range)
            tokensPanel(agg: agg)
            HStack(alignment: .top, spacing: 12) {
                spendTimeline(agg: agg).frame(maxWidth: .infinity)
                topModelsPanel(agg: agg).frame(width: 360)
            }
            HStack(alignment: .top, spacing: 12) {
                todayHourlyPanel(agg: agg).frame(maxWidth: .infinity)
                recentSessionsPanel(agg: agg).frame(maxWidth: .infinity)
            }
            perModelSmallMultiples(agg: agg)
        }
    }

    private var rangeDays: Int {
        switch range {
        case "24H": return 1
        case "7D": return 7
        case "30D": return 30
        case "90D": return 90
        default: return 30
        }
    }

    /// For 24H the "timeline" is hourly; for other ranges it's daily.
    private func rangedDailySpark(_ agg: Core.SessionStore.Aggregates) -> [Double] {
        if range == "24H" {
            return agg.todayDetail.hourly.map { Double($0) / 100_000 }
        }
        let n = min(rangeDays, agg.dailyStats.count)
        return agg.dailyStats.suffix(n).map { Double($0.costMillicents) / 100_000 }
    }

    private func rangedDailyLabels(_ agg: Core.SessionStore.Aggregates) -> [String] {
        if range == "24H" {
            return (0..<24).map { hourLabel($0) }
        }
        let n = min(rangeDays, agg.dailyStats.count)
        return agg.dailyStats.suffix(n).map { $0.date }
    }

    private func kpis(agg: Core.SessionStore.Aggregates) -> some View {
        let today = agg.todayDetail.costMillicents
        let yesterday = agg.dailyStats.dropLast().last?.costMillicents ?? 0
        let delta: Double? = yesterday > 0 ? (Double(today - yesterday) / Double(yesterday)) : nil
        let (dollars, cents) = splitCost(today)
        let spark = rangedDailySpark(agg)

        let totalTokens = agg.todayDetail.inputTokens + agg.todayDetail.outputTokens
        let hourly = agg.todayDetail.hourly.map(Double.init)

        let monthProjection = projectMonth(agg: agg)
        let (pDollars, _) = splitCost(monthProjection)

        return LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4),
                         spacing: 12) {
            KPICard(label: "Spend · today",
                    value: "$\(dollars)", cents: cents,
                    delta: delta, spark: spark, color: Linear.accent)
            KPICard(label: "Tokens · today",
                    value: Formatters.tokens(totalTokens),
                    delta: nil, spark: hourly, color: Linear.info)
            KPICard(label: "Sessions · today",
                    value: "\(agg.todayDetail.sessionCount)",
                    spark: agg.dailyStats.suffix(min(rangeDays, 30))
                        .map { Double($0.sessionCount) },
                    color: Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255))
            KPICard(label: "Projected · month",
                    value: "$\(pDollars)",
                    spark: spark, color: Linear.success)
        }
    }

    private func tokensPanel(agg: Core.SessionStore.Aggregates) -> some View {
        let a = agg.allTime
        let total = a.inputTokens + a.outputTokens + a.cacheReadTokens + a.cacheWriteTokens
        return Panel(
            title: "Tokens · all-time",
            subtitle: "\(Formatters.tokens(total)) across input, output, and cache",
            trailing: AnyView(
                Text(String(format: "%.0f%% cache reuse", a.cacheReuseRatio * 100))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Linear.ink3)),
            accent: Linear.info
        ) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5),
                      spacing: 12) {
                TokenStatCell(label: "Total",       value: total,          color: Linear.ink0, emphasis: true)
                TokenStatCell(label: "Input",       value: a.inputTokens,  color: Linear.accent)
                TokenStatCell(label: "Output",      value: a.outputTokens, color: Linear.success)
                TokenStatCell(label: "Cache read",  value: a.cacheReadTokens,  color: Linear.info)
                TokenStatCell(label: "Cache write", value: a.cacheWriteTokens, color: Linear.warn)
            }
        }
    }

    private func spendTimeline(agg: Core.SessionStore.Aggregates) -> some View {
        let data = rangedDailySpark(agg)
        let labels = rangedDailyLabels(agg)
        let isHourly = range == "24H"
        let subtitle: String = {
            if range == "90D" && agg.dailyStats.count < 90 {
                return "Last \(agg.dailyStats.count) days (90d window, \(agg.dailyStats.count) available)"
            }
            return isHourly ? "Today · hourly spend"
                            : "Last \(data.count) days · daily spend"
        }()
        return Panel(
            title: "Spend timeline",
            subtitle: subtitle,
            trailing: AnyView(
                HStack(spacing: 6) {
                    Swatch(Linear.accent)
                    Text(isHourly ? "hourly spend" : "daily spend")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                }),
            accent: Linear.accent
        ) {
            InteractiveAreaChart(
                data: data,
                labels: labels,
                format: { v in String(format: "$%.2f", v) },
                color: Linear.accent
            )
            .frame(height: 200)
        }
    }

    private func topModelsPanel(agg: Core.SessionStore.Aggregates) -> some View {
        let total = max(agg.allTime.costMillicents, 1)
        let top = Array(agg.models.prefix(6))
        return Panel(
            title: "Top models",
            subtitle: "All-time share",
            accent: Linear.success
        ) {
            VStack(spacing: 10) {
                ForEach(top) { m in
                    let share = Double(m.costMillicents) / Double(total)
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Swatch(Linear.modelColor(m.model))
                            Text(modelShort(m.model))
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(Linear.ink0)
                                .lineLimit(1)
                            Spacer()
                            Text(Formatters.cost(millicents: m.costMillicents))
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(Linear.ink2)
                        }
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color.white.opacity(0.05))
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Linear.modelColor(m.model))
                                    .frame(width: geo.size.width * share)
                            }
                        }
                        .frame(height: 4)
                    }
                }
                if top.isEmpty {
                    Text("No model usage yet")
                        .font(.system(size: 12))
                        .foregroundStyle(Linear.ink3)
                        .padding(.vertical, 20)
                }
            }
        }
    }

    private func todayHourlyPanel(agg: Core.SessionStore.Aggregates) -> some View {
        let hourly = agg.todayDetail.hourly
        return Panel(
            title: "Today · hourly",
            subtitle: "Cost per hour",
            trailing: AnyView(Chip("LIVE", kind: .success, leadingDot: true)),
            accent: Linear.info
        ) {
            InteractiveHourlyBars(
                values: hourly,
                format: { v in Formatters.cost(millicents: v) },
                labelFor: hourLabel,
                color: Linear.info
            )
            .frame(height: 160)
        }
    }

    private func recentSessionsPanel(agg: Core.SessionStore.Aggregates) -> some View {
        let sessions = Array(agg.recentSessions.prefix(6))
        return Panel(
            title: "Recent sessions",
            subtitle: "Latest activity",
            padding: false,
            accent: Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255)
        ) {
            VStack(spacing: 0) {
                ForEach(sessions) { s in
                    HStack(spacing: 10) {
                        Swatch(Linear.modelColor(s.primaryModel))
                        Text(shortSessionId(s.id))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Linear.ink3)
                        Text(modelShort(s.primaryModel))
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Linear.ink1)
                            .lineLimit(1)
                        Text("· \(s.turnCount) turns")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Linear.ink3)
                        Spacer()
                        Text(Formatters.cost(millicents: s.costMillicents))
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(Linear.ink0)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Linear.divider).frame(height: 0.5)
                    }
                }
                if sessions.isEmpty {
                    Text("No sessions yet")
                        .font(.system(size: 12))
                        .foregroundStyle(Linear.ink3)
                        .padding(20)
                }
            }
        }
    }

    private func perModelSmallMultiples(agg: Core.SessionStore.Aggregates) -> some View {
        let top = Array(agg.models.prefix(6))
        return Panel(title: "Per-model · last 30 days", subtitle: "Small multiples",
                     accent: Color(red: 0xb8/255, green: 0xa6/255, blue: 1.0)) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 14), count: 3),
                      spacing: 14) {
                ForEach(top) { m in
                    let trend = Array((agg.modelTrends[m.model] ?? []).suffix(30))
                    let data = trend.map { Double($0) / 100_000 }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Swatch(Linear.modelColor(m.model))
                            Text(modelShort(m.model))
                                .font(.system(size: 11.5, design: .monospaced))
                                .foregroundStyle(Linear.ink0)
                                .lineLimit(1)
                            Spacer()
                            Text(Formatters.cost(millicents: m.costMillicents))
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(Linear.ink2)
                        }
                        Sparkline(data: data.isEmpty ? [0, 0] : data,
                                  color: Linear.modelColor(m.model))
                            .frame(height: 30)
                        HStack {
                            Text("\(m.sessionCount) sess")
                            Spacer()
                            Text(Formatters.tokens(m.inputTokens + m.outputTokens))
                        }
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                    }
                    .padding(12)
                    .background(Linear.panel2)
                    .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
                }
            }
        }
    }
}

private struct TokenStatCell: View {
    let label: String
    let value: Int
    let color: Color
    var emphasis: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(Linear.ink3)
            }
            Text(Formatters.tokens(value))
                .font(.system(size: emphasis ? 22 : 18,
                              weight: emphasis ? .bold : .semibold,
                              design: .monospaced))
                .foregroundStyle(emphasis ? Linear.ink0 : color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Linear.panel2)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

// MARK: - Models

public struct ModelsTab: View {
    @Environment(AppStore.self) private var store
    public init() {}
    public var body: some View {
        let agg = store.aggregates
        let totalCost = max(agg.allTime.costMillicents, 1)
        Panel(title: "All models", subtitle: "Sorted by all-time spend",
              padding: false, accent: Linear.success) {
            VStack(spacing: 0) {
                ModelsHeaderRow()
                ForEach(agg.models) { m in
                    let share = Double(m.costMillicents) / Double(totalCost)
                    let trend = Array((agg.modelTrends[m.model] ?? []).suffix(30))
                    LinearModelRow(
                        model: m,
                        share: share,
                        trend: trend.map { Double($0) / 100_000 }
                    )
                }
                if agg.models.isEmpty {
                    Text("No models yet")
                        .font(.system(size: 12))
                        .foregroundStyle(Linear.ink3)
                        .padding(20)
                }
            }
        }
    }
}

private struct ModelsHeaderRow: View {
    var body: some View {
        HStack(spacing: 12) {
            Text("MODEL").frame(maxWidth: .infinity, alignment: .leading)
            Text("LAST 30D").frame(width: 120, alignment: .leading)
            Text("SHARE").frame(width: 54, alignment: .trailing)
            Text("SESSIONS").frame(width: 72, alignment: .trailing)
            Text("INPUT").frame(width: 70, alignment: .trailing)
            Text("OUTPUT").frame(width: 70, alignment: .trailing)
            Text("CACHE R").frame(width: 72, alignment: .trailing)
            Text("CACHE W").frame(width: 72, alignment: .trailing)
            Text("SPEND").frame(width: 74, alignment: .trailing)
        }
        .font(.system(size: 10.5, weight: .medium))
        .tracking(1.0)
        .foregroundStyle(Linear.ink3)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Linear.divider).frame(height: 0.5)
        }
    }
}

private struct LinearModelRow: View {
    let model: ModelStats
    let share: Double
    let trend: [Double]
    @State private var hover = false

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Swatch(Linear.modelColor(model.model))
                Text(model.model)
                    .font(.system(size: 12.5, design: .monospaced))
                    .foregroundStyle(Linear.ink0)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Sparkline(data: trend.isEmpty ? [0, 0] : trend,
                      color: Linear.modelColor(model.model))
                .frame(width: 120, height: 22)

            Text("\(Int(share * 100))%")
                .frame(width: 54, alignment: .trailing)
                .foregroundStyle(Linear.ink2)
            Text("\(model.sessionCount)")
                .frame(width: 72, alignment: .trailing)
                .foregroundStyle(Linear.ink2)
            Text(Formatters.tokens(model.inputTokens))
                .frame(width: 70, alignment: .trailing)
                .foregroundStyle(Linear.ink2)
            Text(Formatters.tokens(model.outputTokens))
                .frame(width: 70, alignment: .trailing)
                .foregroundStyle(Linear.ink2)
            Text(Formatters.tokens(model.cacheReadTokens))
                .frame(width: 72, alignment: .trailing)
                .foregroundStyle(Linear.ink2)
            Text(Formatters.tokens(model.cacheWriteTokens))
                .frame(width: 72, alignment: .trailing)
                .foregroundStyle(Linear.ink2)
            Text(Formatters.cost(millicents: model.costMillicents))
                .frame(width: 74, alignment: .trailing)
                .foregroundStyle(Linear.modelColor(model.model))
        }
        .font(.system(size: 12, design: .monospaced))
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(hover ? Linear.modelColor(model.model).opacity(0.06) : Color.clear)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Linear.divider).frame(height: 0.5)
        }
        .onHover { hover = $0 }
    }
}

// MARK: - Sessions

public struct SessionsTab: View {
    @Environment(AppStore.self) private var store
    @State private var filter: String = "all"
    @State private var expanded: Set<String> = []
    @State private var page: Int = 0
    @State private var pageSize: Int = 25
    @State private var transcriptTarget: SessionSummary? = nil
    @State private var searchText: String = ""
    @State private var searchCommitted: String = ""
    @State private var matchedSessionIds: Set<String>? = nil
    @State private var searchTask: Task<Void, Never>? = nil
    @State private var searching: Bool = false
    public init() {}

    public var body: some View {
        let all = store.aggregates.recentSessions
        let filtered: [SessionSummary] = {
            var list = all
            switch filter {
            case "today":
                let start = Calendar.current.startOfDay(for: Date())
                list = list.filter { $0.endedAt >= start }
            default: break
            }
            let q = searchCommitted.trimmingCharacters(in: .whitespaces).lowercased()
            guard !q.isEmpty else { return list }
            let idHits = list.filter { $0.id.lowercased().contains(q) }
            if let matched = matchedSessionIds {
                let byContent = list.filter { matched.contains($0.id) }
                // Union preserving id-hit ordering first, then content-only hits.
                let seen = Set(idHits.map(\.id))
                return idHits + byContent.filter { !seen.contains($0.id) }
            }
            return idHits
        }()
        let totalPages = max(1, Int(ceil(Double(filtered.count) / Double(pageSize))))
        let safePage = min(page, totalPages - 1)
        let startIdx = safePage * pageSize
        let endIdx = min(startIdx + pageSize, filtered.count)
        let pageItems = startIdx < endIdx
            ? Array(filtered[startIdx..<endIdx]) : []

        Group {
            if let target = transcriptTarget {
                TranscriptScreen(session: target) { transcriptTarget = nil }
            } else {
                sessionsList(
                    all: all, filtered: filtered, pageItems: pageItems,
                    totalPages: totalPages, safePage: safePage,
                    startIdx: startIdx, endIdx: endIdx)
            }
        }
    }

    @ViewBuilder
    private func sessionsList(
        all: [SessionSummary],
        filtered: [SessionSummary],
        pageItems: [SessionSummary],
        totalPages: Int,
        safePage: Int,
        startIdx: Int,
        endIdx: Int
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                FilterPill("All · \(all.count)", active: filter == "all") {
                    filter = "all"; page = 0
                }
                FilterPill("Today", active: filter == "today") {
                    filter = "today"; page = 0
                }
                SessionsSearchField(
                    text: $searchText,
                    searching: searching,
                    onChange: scheduleSearch
                )
                Spacer()
                Menu {
                    ForEach([10, 25, 50, 100], id: \.self) { n in
                        Button("\(n) per page") { pageSize = n; page = 0 }
                    }
                } label: {
                    Text("\(pageSize) / page")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Linear.ink2)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
            }

            Panel(padding: false, accent: Linear.info) {
                VStack(spacing: 0) {
                    SessionsHeader()
                    ForEach(pageItems) { s in
                        SessionRow(
                            session: s,
                            isExpanded: expanded.contains(s.id),
                            onToggle: {
                                if expanded.contains(s.id) { expanded.remove(s.id) }
                                else { expanded.insert(s.id) }
                            }
                        )
                        if expanded.contains(s.id) {
                            SessionDetailInline(
                                session: s,
                                onShowTranscript: { transcriptTarget = s }
                            )
                        }
                    }
                    if filtered.isEmpty {
                        Text("No sessions").foregroundStyle(Linear.ink3)
                            .font(.system(size: 12)).padding(24)
                    }
                }
            }

            if !filtered.isEmpty {
                SessionsPagination(
                    page: safePage, totalPages: totalPages,
                    total: filtered.count,
                    startIdx: startIdx, endIdx: endIdx,
                    onFirst: { page = 0 },
                    onPrev: { page = max(0, safePage - 1) },
                    onNext: { page = min(totalPages - 1, safePage + 1) },
                    onLast: { page = totalPages - 1 }
                )
            }
        }
    }

    private func scheduleSearch(_ newValue: String) {
        page = 0
        searchTask?.cancel()
        let trimmed = newValue.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty {
            searchCommitted = ""
            matchedSessionIds = nil
            searching = false
            return
        }
        // Apply id-substring results immediately; defer FTS.
        searchCommitted = trimmed
        matchedSessionIds = nil
        searching = true
        let db = store.db
        searchTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            if Task.isCancelled { return }
            guard let db else {
                searching = false
                return
            }
            let ids: [String] = await Task.detached(priority: .userInitiated) {
                (try? MessagesRepo(db: db).searchSessionIds(query: trimmed)) ?? []
            }.value
            if Task.isCancelled { return }
            matchedSessionIds = Set(ids)
            searching = false
        }
    }
}

private struct SessionsSearchField: View {
    @Binding var text: String
    let searching: Bool
    let onChange: (String) -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11))
                .foregroundStyle(Linear.ink3)
            TextField("Search id or messages", text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(Linear.ink1)
                .frame(width: 220)
                .onChange(of: text) { _, newValue in onChange(newValue) }
            if searching {
                ProgressView().controlSize(.mini).scaleEffect(0.6)
                    .frame(width: 12, height: 12)
            } else if !text.isEmpty {
                Button { text = ""; onChange("") } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(Linear.ink3)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Linear.panel)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

private struct SessionsPagination: View {
    let page: Int
    let totalPages: Int
    let total: Int
    let startIdx: Int
    let endIdx: Int
    let onFirst: () -> Void
    let onPrev: () -> Void
    let onNext: () -> Void
    let onLast: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Text("\(startIdx + 1)–\(endIdx) of \(total)")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(Linear.ink2)
            Spacer()
            iconButton("chevron.left.2", enabled: page > 0, onFirst)
            iconButton("chevron.left", enabled: page > 0, onPrev)
            Text("\(page + 1) / \(totalPages)")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(Linear.ink1)
                .padding(.horizontal, 8)
            iconButton("chevron.right", enabled: page < totalPages - 1, onNext)
            iconButton("chevron.right.2", enabled: page < totalPages - 1, onLast)
        }
    }

    private func iconButton(_ name: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: name)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(enabled ? Linear.ink1 : Linear.ink4)
                .frame(width: 24, height: 22)
                .background(Linear.panel)
                .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
    }
}

/// Column widths are the single source of truth; header and rows derive from
/// these so nothing drifts. First column fits an `Apr 19 · 2:38 PM` stamp on
/// one line.
private enum SessionCols {
    static let started:  CGFloat = 170
    static let tool:     CGFloat = 120
    static let turns:    CGFloat = 70
    static let tokens:   CGFloat = 100
    static let cost:     CGFloat = 90
    static let expander: CGFloat = 24
}

private struct SessionsHeader: View {
    var body: some View {
        HStack(spacing: 16) {
            Text("").frame(width: SessionCols.expander)
            Text("STARTED").frame(width: SessionCols.started, alignment: .leading)
            Text("TOOL").frame(width: SessionCols.tool, alignment: .leading)
            Text("MODEL").frame(maxWidth: .infinity, alignment: .leading)
            Text("TURNS").frame(width: SessionCols.turns, alignment: .trailing)
            Text("TOKENS").frame(width: SessionCols.tokens, alignment: .trailing)
            Text("COST").frame(width: SessionCols.cost, alignment: .trailing)
        }
        .font(.system(size: 10.5, weight: .medium))
        .tracking(1.0)
        .foregroundStyle(Linear.ink3)
        .padding(.horizontal, 20).padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Linear.divider).frame(height: 0.5)
        }
    }
}

private let sessionDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "MMM d · h:mm a"
    return f
}()

private struct SessionRow: View {
    let session: SessionSummary
    let isExpanded: Bool
    let onToggle: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 16) {
                Image(systemName: "chevron.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Linear.ink3)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
                    .frame(width: SessionCols.expander, alignment: .leading)

                Text(sessionDateFormatter.string(from: session.endedAt))
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Linear.ink1)
                    .lineLimit(1)
                    .frame(width: SessionCols.started, alignment: .leading)

                HStack(spacing: 0) {
                    Chip(toolShort(session.tool), kind: toolChipKind(session.tool))
                    Spacer(minLength: 0)
                }
                .frame(width: SessionCols.tool, alignment: .leading)

                HStack(spacing: 6) {
                    Swatch(Linear.modelColor(session.primaryModel))
                    Text(session.primaryModel)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Linear.modelColor(session.primaryModel))
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if session.models.count > 1 {
                        Text("+\(session.models.count - 1)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(Linear.ink3)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Text("\(session.turnCount)")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Linear.ink2)
                    .frame(width: SessionCols.turns, alignment: .trailing)

                Text(Formatters.tokens(session.inputTokens + session.outputTokens))
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Linear.ink2)
                    .frame(width: SessionCols.tokens, alignment: .trailing)

                Text(Formatters.cost(millicents: session.costMillicents))
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(Linear.success)
                    .frame(width: SessionCols.cost, alignment: .trailing)
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(hover ? Linear.panel2 : Color.clear)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Linear.divider).frame(height: 0.5)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

// MARK: - Insights

public struct InsightsTab: View {
    @Environment(AppStore.self) private var store
    @State private var severityFilter: String = "all"
    public init() {}

    public var body: some View {
        let dets = store.detections
        let open = dets.count
        let blocks = dets.filter { $0.severity == .block }.count
        let warns = dets.filter { $0.severity == .warn }.count

        let filtered: [Detection] = severityFilter == "all"
            ? dets
            : dets.filter { $0.severity.rawValue == severityFilter }

        VStack(alignment: .leading, spacing: 14) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3),
                      spacing: 12) {
                KPICard(label: "Open insights", value: "\(open)", color: Linear.warn)
                KPICard(label: "Blocks", value: "\(blocks)", color: Linear.danger)
                KPICard(label: "Warnings", value: "\(warns)", color: Linear.warn)
            }

            HStack(spacing: 8) {
                FilterPill("All", active: severityFilter == "all") { severityFilter = "all" }
                FilterPill("Block", active: severityFilter == "block") { severityFilter = "block" }
                FilterPill("Warn", active: severityFilter == "warn") { severityFilter = "warn" }
                FilterPill("Info", active: severityFilter == "info") { severityFilter = "info" }
                Spacer()
            }

            Panel(padding: false, accent: Linear.warn) {
                if filtered.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 24))
                            .foregroundStyle(Linear.ink3)
                        Text("No insights yet")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Linear.ink1)
                        Text("Detections appear here as Claude Code hooks fire.")
                            .font(.system(size: 11))
                            .foregroundStyle(Linear.ink3)
                    }
                    .frame(maxWidth: .infinity).padding(40)
                } else {
                    VStack(spacing: 0) {
                        ForEach(filtered) { d in
                            InsightCard(detection: d)
                        }
                    }
                }
            }
        }
    }
}

private struct InsightCard: View {
    @Environment(AppStore.self) private var store
    let detection: Detection
    @State private var hover = false
    @State private var actionStatus: String? = nil
    @State private var actionKind: ActionKind? = nil

    private enum ActionKind { case success, failure }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 7)
                    .fill(iconBg)
                Image(systemName: iconName)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iconFg)
            }
            .frame(width: 26, height: 26)

            VStack(alignment: .leading, spacing: 3) {
                Text(detection.summary)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Linear.ink0)
                Text(detection.ruleId)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Linear.ink3)
                if let d = detection.detail, !d.isEmpty {
                    Text(d)
                        .font(.system(size: 12))
                        .foregroundStyle(Linear.ink2)
                        .lineLimit(2)
                        .padding(.top, 2)
                }
                if let msg = actionStatus {
                    Text(msg)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(actionKind == .success ? Linear.success : Linear.danger)
                        .padding(.top, 4)
                }
            }
            Spacer(minLength: 0)
            VStack(alignment: .trailing, spacing: 6) {
                Chip(detection.severity.rawValue.uppercased(), kind: chipKind)
                HStack(spacing: 6) {
                    if detection.ruleId == "B8_file_reopen",
                       let path = Self.extractPath(summary: detection.summary) {
                        LinearButton("Add to CLAUDE.md", icon: "doc.append",
                                     primary: true) {
                            addToClaudeMD(path: path)
                        }
                    }
                    if detection.ruleId == "B9_prompt_pattern",
                       let phrase = Self.extractPrefix(summary: detection.summary) {
                        LinearButton("Create slash command", icon: "terminal",
                                     primary: true) {
                            createSlashCommand(phrase: phrase)
                        }
                    }
                    if detection.ruleId == "B7_correction_graph",
                       let phrase = Self.extractCorrection(summary: detection.summary) {
                        LinearButton("Add to CLAUDE.md", icon: "doc.append",
                                     primary: true) {
                            addCorrectionToClaudeMD(phrase: phrase)
                        }
                    }
                    if detection.acknowledgedAt == nil {
                        LinearButton("Dismiss", icon: "xmark", ghost: true) {
                            dismiss()
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(hover ? Color.white.opacity(0.02) : Color.clear)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Linear.divider).frame(height: 0.5)
        }
        .onHover { hover = $0 }
    }

    private static func extractPath(summary: String) -> String? {
        guard summary.hasPrefix("/"),
              let range = summary.range(of: " opened across") else { return nil }
        return String(summary[..<range.lowerBound])
    }

    /// B9_prompt_pattern summary shape: `"the first five words…" used Nx — …`
    private static func extractPrefix(summary: String) -> String? {
        guard let first = summary.firstIndex(of: "\""),
              let second = summary[summary.index(after: first)...].firstIndex(of: "\"")
        else { return nil }
        var raw = String(summary[summary.index(after: first)..<second])
        if raw.hasSuffix("…") { raw.removeLast() }
        let trimmed = raw.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// B7_correction_graph summary shape: `"don't do x" said N× across M sessions — …`
    private static func extractCorrection(summary: String) -> String? {
        extractPrefix(summary: summary)
    }

    private func createSlashCommand(phrase: String) {
        do {
            let result = try SlashCommandWriter.scaffold(phrase: phrase)
            actionStatus = "Wrote \(result.relativePath)"
            actionKind = .success
            if let db = store.db, let id = detection.id {
                try? DetectionsRepo(db: db).acknowledge(id: id)
                store.refresh()
            }
        } catch {
            actionStatus = "Failed: \(error.localizedDescription)"
            actionKind = .failure
        }
    }

    private func addCorrectionToClaudeMD(phrase: String) {
        do {
            let result = try ClaudeMDUpdater.appendCorrection(phrase: phrase)
            actionStatus = "Added to \(result.relativePath)"
            actionKind = .success
            if let db = store.db, let id = detection.id {
                try? DetectionsRepo(db: db).acknowledge(id: id)
                store.refresh()
            }
        } catch {
            actionStatus = "Failed: \(error.localizedDescription)"
            actionKind = .failure
        }
    }

    private func dismiss() {
        guard let db = store.db, let id = detection.id else { return }
        do {
            try DetectionsRepo(db: db).acknowledge(id: id)
            store.refresh()
        } catch {
            actionStatus = "Dismiss failed: \(error.localizedDescription)"
            actionKind = .failure
        }
    }

    private func addToClaudeMD(path: String) {
        do {
            let result = try ClaudeMDUpdater.appendHotPath(
                filePath: path, summary: detection.summary)
            actionStatus = "Added to \(result.relativePath)"
            actionKind = .success
            if let db = store.db, let id = detection.id {
                try? DetectionsRepo(db: db).acknowledge(id: id)
                store.refresh()
            }
        } catch {
            actionStatus = "Failed: \(error.localizedDescription)"
            actionKind = .failure
        }
    }

    private var chipKind: ChipKind {
        switch detection.severity {
        case .info: return .info
        case .warn: return .warn
        case .block: return .danger
        }
    }
    private var iconBg: Color {
        switch detection.severity {
        case .info: return Linear.info.opacity(0.12)
        case .warn: return Linear.warn.opacity(0.12)
        case .block: return Linear.danger.opacity(0.12)
        }
    }
    private var iconFg: Color {
        switch detection.severity {
        case .info: return Linear.info
        case .warn: return Linear.warn
        case .block: return Linear.danger
        }
    }
    private var iconName: String {
        switch detection.severity {
        case .info: return "info.circle.fill"
        case .warn: return "exclamationmark.triangle.fill"
        case .block: return "xmark.octagon.fill"
        }
    }
}

// MARK: - CLAUDE.md updater

enum ClaudeMDUpdater {
    struct Result { let absolutePath: URL; let relativePath: String }

    enum Failure: Error, LocalizedError {
        case noRepoRoot
        case noteMalformed
        case ioError(String)

        var errorDescription: String? {
            switch self {
            case .noRepoRoot: return "No .git directory found above this file"
            case .noteMalformed: return "Could not parse summary"
            case .ioError(let m): return m
            }
        }
    }

    /// Appends a note about `filePath` under a managed `<!-- tokscale:hot-paths -->`
    /// block at the top of `<repoRoot>/CLAUDE.md`. Safe to call repeatedly — existing
    /// entries for the same relative path are replaced rather than duplicated.
    static func appendHotPath(filePath: String, summary: String) throws -> Result {
        guard let repoRoot = findRepoRoot(startingAt: filePath) else {
            throw Failure.noRepoRoot
        }
        let claudeURL = repoRoot.appendingPathComponent("CLAUDE.md")
        let fileURL = URL(fileURLWithPath: filePath)
        let rel = relativePath(fileURL, from: repoRoot)
        let note = extractNote(summary: summary) ?? "recurring hot path"

        let existing: String = (try? String(contentsOf: claudeURL, encoding: .utf8)) ?? ""
        let updated = upsertHotPath(in: existing, relPath: rel, note: note)
        do {
            try updated.write(to: claudeURL, atomically: true, encoding: .utf8)
        } catch {
            throw Failure.ioError(error.localizedDescription)
        }
        return Result(absolutePath: claudeURL, relativePath: rel)
    }

    /// Pull "opened across N sessions" out of the summary and render a clean
    /// note — the raw summary starts with an absolute path that would duplicate
    /// the entry's code-span prefix.
    private static func extractNote(summary: String) -> String? {
        let pattern = #"opened across (\d+) sessions"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(summary.startIndex..., in: summary)
        guard let match = regex.firstMatch(in: summary, range: range),
              let r = Range(match.range(at: 1), in: summary) else { return nil }
        return "touched across \(summary[r]) sessions"
    }

    private static let blockStart = "<!-- tokscale:hot-paths -->"
    private static let blockEnd = "<!-- /tokscale:hot-paths -->"

    /// Either updates an existing managed block with the new entry, or creates
    /// one at the end of the file. Entries read as a bulleted list keyed on
    /// relative path, so re-running the action is idempotent.
    private static func upsertHotPath(in content: String, relPath: String, note: String) -> String {
        let entry = "- `\(relPath)` — \(note)"
        if let blockRange = extractBlockRange(in: content) {
            let blockBody = String(content[blockRange])
            let newBody = replaceOrAppendEntry(in: blockBody, relPath: relPath, entry: entry)
            return content.replacingCharacters(in: blockRange, with: newBody)
        }
        let header = "\n\n## Hot paths (auto-maintained by Tokscale)\n\n"
        let block = "\(blockStart)\n\(entry)\n\(blockEnd)"
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "# CLAUDE.md\(header)\(block)\n"
        }
        return trimmed + header + block + "\n"
    }

    private static func extractBlockRange(in content: String) -> Range<String.Index>? {
        guard let startRange = content.range(of: blockStart),
              let endRange = content.range(of: blockEnd, range: startRange.upperBound..<content.endIndex)
        else { return nil }
        return startRange.lowerBound..<endRange.upperBound
    }

    private static func replaceOrAppendEntry(in block: String, relPath: String, entry: String) -> String {
        var lines = block.components(separatedBy: "\n")
        let key = "`\(relPath)`"
        let filtered = lines.enumerated().filter { !(1..<lines.count - 1 ~= $0.offset && $0.element.contains(key)) }
        lines = filtered.map(\.element)
        // Insert the new entry just before the end marker.
        if let endIdx = lines.firstIndex(where: { $0.contains(blockEnd) }) {
            lines.insert(entry, at: endIdx)
        }
        return lines.joined(separator: "\n")
    }

    private static func findRepoRoot(startingAt filePath: String) -> URL? {
        let fm = FileManager.default
        var dir = URL(fileURLWithPath: filePath).deletingLastPathComponent()
        for _ in 0..<40 {
            let git = dir.appendingPathComponent(".git")
            var isDir: ObjCBool = false
            if fm.fileExists(atPath: git.path, isDirectory: &isDir) { return dir }
            let parent = dir.deletingLastPathComponent()
            if parent == dir { return nil }
            dir = parent
        }
        return nil
    }

    private static func relativePath(_ file: URL, from root: URL) -> String {
        let rootPath = root.standardizedFileURL.path.hasSuffix("/")
            ? root.standardizedFileURL.path
            : root.standardizedFileURL.path + "/"
        let filePath = file.standardizedFileURL.path
        if filePath.hasPrefix(rootPath) {
            return String(filePath.dropFirst(rootPath.count))
        }
        return filePath
    }

    /// Append a recurring correction phrase to `~/.claude/CLAUDE.md` under a
    /// managed block. Correction phrases are usually user-wide preferences, so
    /// global home-level CLAUDE.md is the right target — per-repo CLAUDE.md
    /// would scatter the same rule across every codebase.
    static func appendCorrection(phrase: String) throws -> Result {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let claudeDir = home.appendingPathComponent(".claude", isDirectory: true)
        try? FileManager.default.createDirectory(at: claudeDir,
                                                 withIntermediateDirectories: true)
        let claudeURL = claudeDir.appendingPathComponent("CLAUDE.md")
        let existing: String = (try? String(contentsOf: claudeURL, encoding: .utf8)) ?? ""
        let updated = upsertCorrection(in: existing, phrase: phrase)
        do {
            try updated.write(to: claudeURL, atomically: true, encoding: .utf8)
        } catch {
            throw Failure.ioError(error.localizedDescription)
        }
        return Result(absolutePath: claudeURL, relativePath: "~/.claude/CLAUDE.md")
    }

    private static let correctionsStart = "<!-- tokscale:corrections -->"
    private static let correctionsEnd = "<!-- /tokscale:corrections -->"

    private static func upsertCorrection(in content: String, phrase: String) -> String {
        let normalized = phrase.lowercased()
        let entry = "- Avoid patterns that trigger \"\(phrase)\" corrections"
        if let start = content.range(of: correctionsStart),
           let end = content.range(of: correctionsEnd, range: start.upperBound..<content.endIndex) {
            let blockRange = start.lowerBound..<end.upperBound
            var lines = String(content[blockRange]).components(separatedBy: "\n")
            // Drop any line that already references this phrase.
            lines = lines.filter { !$0.lowercased().contains("\"\(normalized)\"") || $0.contains(correctionsStart) || $0.contains(correctionsEnd) }
            if let endIdx = lines.firstIndex(where: { $0.contains(correctionsEnd) }) {
                lines.insert(entry, at: endIdx)
            }
            return content.replacingCharacters(in: blockRange,
                                               with: lines.joined(separator: "\n"))
        }
        let header = "\n\n## Recurring corrections (auto-maintained by Tokscale)\n\n"
        let block = "\(correctionsStart)\n\(entry)\n\(correctionsEnd)"
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "# CLAUDE.md\(header)\(block)\n"
        }
        return trimmed + header + block + "\n"
    }
}

/// Scaffolds `~/.claude/commands/<slug>.md` from a recurring prompt prefix so
/// the user can invoke `/slug` in Claude Code instead of retyping the phrase.
enum SlashCommandWriter {
    struct Result { let absolutePath: URL; let relativePath: String }

    enum Failure: Error, LocalizedError {
        case ioError(String)
        case emptyPhrase

        var errorDescription: String? {
            switch self {
            case .emptyPhrase: return "Prompt pattern was empty"
            case .ioError(let m): return m
            }
        }
    }

    static func scaffold(phrase: String) throws -> Result {
        let trimmed = phrase.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { throw Failure.emptyPhrase }
        let slug = slugify(trimmed)
        let home = FileManager.default.homeDirectoryForCurrentUser
        let dir = home.appendingPathComponent(".claude/commands", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let fileURL = dir.appendingPathComponent("\(slug).md")
        let body = """
            ---
            description: Tokscale scaffold — recurring prompt pattern captured from \
            your session history.
            ---

            \(trimmed)

            <!--
            Edit this file to flesh out the command. Tokscale only seeded it with
            the detected prefix; fill in the rest of your workflow here.
            -->
            """
        do {
            try body.write(to: fileURL, atomically: true, encoding: .utf8)
        } catch {
            throw Failure.ioError(error.localizedDescription)
        }
        return Result(absolutePath: fileURL,
                      relativePath: "~/.claude/commands/\(slug).md")
    }

    private static func slugify(_ s: String) -> String {
        let allowed = CharacterSet.alphanumerics
        let lowered = s.lowercased()
        var out = ""
        var lastWasSep = false
        for scalar in lowered.unicodeScalars {
            if allowed.contains(scalar) {
                out.append(Character(scalar))
                lastWasSep = false
            } else if !lastWasSep && !out.isEmpty {
                out.append("-")
                lastWasSep = true
            }
        }
        while out.hasSuffix("-") { out.removeLast() }
        return out.isEmpty ? "tokscale-command" : String(out.prefix(40))
    }
}

// MARK: - Budgets

public struct BudgetTab: View {
    @Environment(AppStore.self) private var store
    @State private var showingAdd = false
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("\(store.budgets.count) budgets")
                    .font(.system(size: 12.5))
                    .foregroundStyle(Linear.ink2)
                Spacer()
                LinearButton("+ New budget", primary: true) { showingAdd = true }
            }

            if store.budgets.isEmpty {
                Panel {
                    VStack(spacing: 8) {
                        Image(systemName: "dollarsign.circle")
                            .font(.system(size: 28))
                            .foregroundStyle(Linear.ink3)
                        Text("No budgets configured")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Linear.ink1)
                        Text("Create a budget to receive alerts as you approach the limit.")
                            .font(.system(size: 11))
                            .foregroundStyle(Linear.ink3)
                    }
                    .frame(maxWidth: .infinity).padding(30)
                }
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 2),
                          spacing: 12) {
                    ForEach(store.budgets) { b in
                        BudgetCard(budget: b)
                    }
                }
            }
        }
        .sheet(isPresented: $showingAdd) {
            BudgetForm(onSave: { b in
                if let db = store.db {
                    try? BudgetsRepo(db: db).upsert(b)
                    store.refresh()
                }
                showingAdd = false
            }, onCancel: { showingAdd = false })
        }
    }
}

private struct BudgetCard: View {
    @Environment(AppStore.self) private var store
    let budget: Budget

    var spend: Int {
        guard let db = store.db else { return 0 }
        return BudgetCalculator.spend(budget: budget, db: db)
    }

    var body: some View {
        let limitMc = budget.limitCents * 1000
        let pct = limitMc == 0 ? 0 : min(1.0, Double(spend) / Double(limitMc))
        let alertT = Double(budget.alertAtPct) / 100
        let (chipKind, chipText): (ChipKind, String) = {
            if pct >= 1 { return (.danger, "OVER BUDGET") }
            if pct >= alertT { return (.warn, "\(Int(pct * 100))%") }
            return (.ghost, "\(Int(pct * 100))%")
        }()
        let fillColor: Color = pct >= 1 ? Linear.danger : (pct >= alertT ? Linear.warn : Linear.accent)

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(budget.scope.rawValue.capitalized) · \(budget.period.rawValue)")
                        .font(.system(size: 13.5, weight: .semibold))
                        .foregroundStyle(Linear.ink0)
                    if let v = budget.scopeValue, !v.isEmpty {
                        Text(v)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Linear.ink3)
                    } else {
                        Text(budget.period.rawValue)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Linear.ink3)
                    }
                }
                Spacer()
                Chip(chipText, kind: chipKind)
            }

            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text(Formatters.cost(millicents: spend))
                    .font(.system(size: 22, weight: .medium, design: .monospaced))
                    .foregroundStyle(Linear.ink0)
                Text("/ $\(budget.limitCents / 100)")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(Linear.ink2)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.05))
                    RoundedRectangle(cornerRadius: 3)
                        .fill(fillColor)
                        .frame(width: geo.size.width * pct)
                    Rectangle()
                        .fill(Linear.ink3)
                        .frame(width: 1.5)
                        .offset(x: geo.size.width * alertT)
                }
            }
            .frame(height: 6)

            HStack {
                Text("alert @ \(budget.alertAtPct)%")
                Spacer()
                Text("\(max(0, budget.limitCents - spend / 1000)) remaining")
            }
            .font(.system(size: 10.5, design: .monospaced))
            .foregroundStyle(Linear.ink3)
        }
        .padding(16)
        .background(Linear.panel)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

struct BudgetForm: View {
    @State private var id = UUID().uuidString
    @State private var scope: BudgetScope = .global
    @State private var scopeValue: String = ""
    @State private var period: BudgetPeriod = .daily
    @State private var limitDollars: Double = 10
    @State private var alertAtPct: Double = 80

    let onSave: (Budget) -> Void
    let onCancel: () -> Void

    var body: some View {
        Form {
            Picker("Scope", selection: $scope) {
                Text("Global").tag(BudgetScope.global)
                Text("Project (cwd prefix)").tag(BudgetScope.project)
                Text("Repo").tag(BudgetScope.repo)
            }
            if scope != .global {
                TextField(scope == .repo ? "owner/repo" : "/path/prefix",
                          text: $scopeValue)
            }
            Picker("Period", selection: $period) {
                Text("Daily").tag(BudgetPeriod.daily)
                Text("Weekly").tag(BudgetPeriod.weekly)
                Text("Monthly").tag(BudgetPeriod.monthly)
            }
            HStack {
                Text("Limit ($)")
                TextField("10", value: $limitDollars, format: .number)
                    .textFieldStyle(.roundedBorder)
            }
            VStack(alignment: .leading) {
                Text("Alert at \(Int(alertAtPct))%")
                Slider(value: $alertAtPct, in: 50...100, step: 5)
            }
            HStack {
                Spacer()
                Button("Cancel", action: onCancel)
                Button("Save") {
                    onSave(Budget(
                        id: id, scope: scope,
                        scopeValue: scopeValue.isEmpty ? nil : scopeValue,
                        period: period,
                        limitCents: Int(limitDollars * 100),
                        alertAtPct: Int(alertAtPct)))
                }
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 420)
    }
}

// MARK: - Repos

public struct ReposTab: View {
    @Environment(AppStore.self) private var store
    public init() {}
    public var body: some View {
        let repos = store.aggregates.repos
        Panel(title: "Repos", subtitle: "Sorted by spend", padding: false,
              accent: Color(red: 0xb8/255, green: 0xa6/255, blue: 1.0)) {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text("REPO").frame(maxWidth: .infinity, alignment: .leading)
                    Text("SESSIONS").frame(width: 80, alignment: .trailing)
                    Text("MODELS").frame(width: 80, alignment: .trailing)
                    Text("COST").frame(width: 80, alignment: .trailing)
                }
                .font(.system(size: 10.5, weight: .medium))
                .tracking(1.0)
                .foregroundStyle(Linear.ink3)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Linear.divider).frame(height: 0.5)
                }

                ForEach(repos) { r in
                    HStack(spacing: 12) {
                        Text(r.repo)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .lineLimit(1)
                            .foregroundStyle(Linear.ink1)
                        Text("\(r.sessionCount)")
                            .frame(width: 80, alignment: .trailing)
                            .foregroundStyle(Linear.ink2)
                        Text("\(r.models.count)")
                            .frame(width: 80, alignment: .trailing)
                            .foregroundStyle(Linear.ink2)
                        Text(Formatters.cost(millicents: r.costMillicents))
                            .frame(width: 80, alignment: .trailing)
                            .foregroundStyle(Linear.ink0)
                    }
                    .font(.system(size: 12, design: .monospaced))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Linear.divider).frame(height: 0.5)
                    }
                }
                if repos.isEmpty {
                    Text("No repos detected")
                        .foregroundStyle(Linear.ink3)
                        .font(.system(size: 12)).padding(20)
                }
            }
        }
    }
}

// MARK: - Daily

public struct DailyTab: View {
    @Environment(AppStore.self) private var store
    @State private var range: String = "30D"
    public init() {}

    private var rangeDays: Int {
        switch range { case "7D": return 7; case "90D": return 90; default: return 30 }
    }

    public var body: some View {
        let all = store.aggregates.dailyStats
        let days = Array(all.suffix(rangeDays))
        let totalCost = days.reduce(0) { $0 + $1.costMillicents }
        let activeDays = days.filter { $0.costMillicents > 0 }.count
        let sessionsTotal = days.reduce(0) { $0 + $1.sessionCount }
        let tokensTotal = days.reduce(0) { $0 + $1.inputTokens + $1.outputTokens }
        let dailyAvg = days.isEmpty ? 0 : totalCost / days.count
        let activeAvg = activeDays > 0 ? totalCost / activeDays : 0
        let peak = days.max(by: { $0.costMillicents < $1.costMillicents })
        let streak = Self.currentActiveStreak(days: all)
        let (wkdayAvg, weekendAvg) = Self.weekdayVsWeekend(days: days)
        let projected = Self.monthProjection(days: all)

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Spacer()
                RangeSegmented(selection: $range, options: ["7D", "30D", "90D"])
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5),
                      spacing: 12) {
                DailyKPI(label: "Total",       value: Formatters.cost(millicents: totalCost),
                         sub: "\(days.count) days", color: Linear.info)
                DailyKPI(label: "Daily avg",   value: Formatters.cost(millicents: dailyAvg),
                         sub: "\(Formatters.cost(millicents: activeAvg))/active",
                         color: Linear.accent)
                DailyKPI(label: "Active days", value: "\(activeDays)",
                         sub: "\(days.count - activeDays) idle", color: Linear.success)
                DailyKPI(label: "Peak day",
                         value: Formatters.cost(millicents: peak?.costMillicents ?? 0),
                         sub: peak?.date ?? "—", color: Linear.warn)
                DailyKPI(label: "Active streak", value: "\(streak)",
                         sub: "consec. days", color: Color(red: 0xb8/255, green: 0xa6/255, blue: 1.0))
            }

            HStack(alignment: .top, spacing: 12) {
                Panel(title: "Daily spend",
                      subtitle: "Range: last \(days.count) days",
                      trailing: AnyView(
                        Text("Projected month: \(Formatters.cost(millicents: projected))")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Linear.ink3)),
                      accent: Linear.info) {
                    InteractiveAreaChart(
                        data: days.map { Double($0.costMillicents) / 100_000 },
                        labels: days.map(\.date),
                        format: { v in String(format: "$%.2f", v) },
                        color: Linear.info
                    )
                    .frame(height: 240)
                }
                .frame(maxWidth: .infinity)

                Panel(title: "Day of week",
                      subtitle: "Avg spend by weekday",
                      trailing: AnyView(
                        Text(weekendAvg > wkdayAvg ? "Weekend-heavy" : "Weekday-heavy")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(Linear.ink3)),
                      accent: Linear.accent) {
                    WeekdayHeatmap(days: days)
                }
                .frame(width: 320)
            }

            HStack(alignment: .top, spacing: 12) {
                Panel(title: "Sessions per day",
                      subtitle: "\(sessionsTotal) sessions · \(Formatters.tokens(tokensTotal)) tokens",
                      accent: Linear.success) {
                    InteractiveAreaChart(
                        data: days.map { Double($0.sessionCount) },
                        labels: days.map(\.date),
                        format: { v in String(format: "%.0f", v) },
                        color: Linear.success
                    )
                    .frame(height: 200)
                }
                .frame(maxWidth: .infinity)

                Panel(title: "Top days",
                      subtitle: "Most expensive in range",
                      padding: false,
                      accent: Linear.warn) {
                    TopDaysList(days: days)
                }
                .frame(width: 320)
            }

            Panel(title: "Weekly rollup",
                  subtitle: "Week-over-week spend and sessions",
                  padding: false,
                  accent: Linear.success) {
                WeeklyRollupTable(days: days)
            }
        }
    }

    // MARK: helpers

    private static func currentActiveStreak(days: [DayStats]) -> Int {
        var count = 0
        for d in days.reversed() {
            if d.costMillicents > 0 { count += 1 } else { break }
        }
        return count
    }

    private static func monthProjection(days: [DayStats]) -> Int {
        let cal = Calendar.current
        let now = Date()
        let monthDays = cal.range(of: .day, in: .month, for: now)?.count ?? 30
        let dayOfMonth = cal.component(.day, from: now)
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        let ym = { (d: Date) -> String in
            let comps = cal.dateComponents([.year, .month], from: d)
            return String(format: "%04d-%02d", comps.year ?? 0, comps.month ?? 0)
        }
        let nowYM = ym(now)
        let monthSoFar = days.filter { $0.date.hasPrefix(nowYM) }
            .reduce(0) { $0 + $1.costMillicents }
        guard dayOfMonth > 0 else { return 0 }
        return Int(Double(monthSoFar) * Double(monthDays) / Double(dayOfMonth))
    }

    private static func weekdayVsWeekend(days: [DayStats]) -> (Int, Int) {
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        let cal = Calendar.current
        var wkday = 0, wkdayCount = 0, wkend = 0, wkendCount = 0
        for d in days {
            guard let date = fmt.date(from: d.date) else { continue }
            let w = cal.component(.weekday, from: date)
            if w == 1 || w == 7 { wkend += d.costMillicents; wkendCount += 1 }
            else { wkday += d.costMillicents; wkdayCount += 1 }
        }
        return (wkdayCount > 0 ? wkday / wkdayCount : 0,
                wkendCount > 0 ? wkend / wkendCount : 0)
    }
}

// MARK: - Daily helpers

private struct DailyKPI: View {
    let label: String
    let value: String
    let sub: String
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(Linear.ink3)
            }
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundStyle(Linear.ink0)
            Text(sub)
                .font(.system(size: 10.5, design: .monospaced))
                .foregroundStyle(Linear.ink3)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(Linear.panel2)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

private struct WeekdayHeatmap: View {
    let days: [DayStats]

    private static let labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    private var buckets: [(avg: Int, total: Int, count: Int)] {
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        let cal = Calendar.current
        // Weekday 1=Sun..7=Sat; map to Mon-first
        var totals = Array(repeating: 0, count: 7)
        var counts = Array(repeating: 0, count: 7)
        for d in days {
            guard let date = fmt.date(from: d.date) else { continue }
            let w = cal.component(.weekday, from: date) // 1..7
            let idx = (w + 5) % 7 // Mon=0
            totals[idx] += d.costMillicents
            counts[idx] += 1
        }
        return (0..<7).map { i in
            let avg = counts[i] > 0 ? totals[i] / counts[i] : 0
            return (avg, totals[i], counts[i])
        }
    }

    var body: some View {
        let b = buckets
        let peak = max(1, b.map(\.avg).max() ?? 1)
        VStack(spacing: 6) {
            ForEach(0..<7, id: \.self) { i in
                HStack(spacing: 8) {
                    Text(Self.labels[i])
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(Linear.ink2)
                        .frame(width: 38, alignment: .leading)
                    GeometryReader { geo in
                        let ratio = Double(b[i].avg) / Double(peak)
                        let w = max(2, geo.size.width * CGFloat(ratio))
                        ZStack(alignment: .leading) {
                            Rectangle().fill(Linear.panelHi).frame(height: 14)
                            Rectangle().fill(Linear.accent.opacity(0.3 + 0.6 * ratio))
                                .frame(width: w, height: 14)
                        }
                    }
                    .frame(height: 14)
                    Text(Formatters.cost(millicents: b[i].avg))
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundStyle(Linear.ink2)
                        .frame(width: 60, alignment: .trailing)
                }
            }
        }
    }
}

private struct TopDaysList: View {
    let days: [DayStats]

    var body: some View {
        let top = days.sorted { $0.costMillicents > $1.costMillicents }.prefix(6)
        VStack(spacing: 0) {
            ForEach(Array(top.enumerated()), id: \.offset) { pair in
                let d = pair.element
                HStack(spacing: 10) {
                    Text("#\(pair.offset + 1)")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                        .frame(width: 24, alignment: .leading)
                    Text(d.date)
                        .font(.system(size: 11.5, design: .monospaced))
                        .foregroundStyle(Linear.ink1)
                    Spacer()
                    Text("\(d.sessionCount) sess")
                        .font(.system(size: 10.5, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                    Text(Formatters.cost(millicents: d.costMillicents))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(Linear.ink0)
                        .frame(width: 72, alignment: .trailing)
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Linear.divider).frame(height: 0.5)
                }
            }
            if top.isEmpty {
                Text("No activity")
                    .font(.system(size: 12))
                    .foregroundStyle(Linear.ink3)
                    .padding(20)
            }
        }
    }
}

private struct WeeklyRollupTable: View {
    let days: [DayStats]

    private struct Row: Identifiable {
        let id: String  // week key
        let label: String
        let cost: Int
        let sessions: Int
        let tokens: Int
        let activeDays: Int
    }

    private var rows: [Row] {
        let fmt = DateFormatter(); fmt.dateFormat = "yyyy-MM-dd"
        let cal = Calendar.current
        var grouped: [String: Row] = [:]
        var order: [String] = []
        for d in days {
            guard let date = fmt.date(from: d.date) else { continue }
            let comps = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
            let key = String(format: "%04d-W%02d",
                             comps.yearForWeekOfYear ?? 0, comps.weekOfYear ?? 0)
            // Monday of that ISO week for a friendly label.
            let mondayComps = DateComponents(weekOfYear: comps.weekOfYear,
                                              yearForWeekOfYear: comps.yearForWeekOfYear)
            let monday = cal.date(from: mondayComps) ?? date
            let f = DateFormatter(); f.dateFormat = "MMM d"
            let label = "Wk of \(f.string(from: monday))"

            var row = grouped[key] ?? Row(id: key, label: label,
                                          cost: 0, sessions: 0, tokens: 0, activeDays: 0)
            row = Row(id: row.id, label: row.label,
                     cost: row.cost + d.costMillicents,
                     sessions: row.sessions + d.sessionCount,
                     tokens: row.tokens + d.inputTokens + d.outputTokens,
                     activeDays: row.activeDays + (d.costMillicents > 0 ? 1 : 0))
            if grouped[key] == nil { order.append(key) }
            grouped[key] = row
        }
        return order.reversed().compactMap { grouped[$0] }
    }

    var body: some View {
        let data = rows
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text("WEEK").frame(maxWidth: .infinity, alignment: .leading)
                Text("ACTIVE").frame(width: 70, alignment: .trailing)
                Text("SESSIONS").frame(width: 80, alignment: .trailing)
                Text("TOKENS").frame(width: 80, alignment: .trailing)
                Text("SPEND").frame(width: 90, alignment: .trailing)
                Text("Δ").frame(width: 60, alignment: .trailing)
            }
            .font(.system(size: 10.5, weight: .medium))
            .tracking(1.0)
            .foregroundStyle(Linear.ink3)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Linear.divider).frame(height: 0.5)
            }

            ForEach(Array(data.enumerated()), id: \.offset) { pair in
                let row = pair.element
                // pair.offset==0 is latest; comparison is vs next (older) week.
                let prev: Int? = pair.offset + 1 < data.count
                    ? data[pair.offset + 1].cost : nil
                let delta: Double? = {
                    guard let prev, prev > 0 else { return nil }
                    return Double(row.cost - prev) / Double(prev)
                }()
                HStack(spacing: 12) {
                    Text(row.label)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Linear.ink0)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("\(row.activeDays)/7")
                        .frame(width: 70, alignment: .trailing)
                        .foregroundStyle(Linear.ink2)
                    Text("\(row.sessions)")
                        .frame(width: 80, alignment: .trailing)
                        .foregroundStyle(Linear.ink2)
                    Text(Formatters.tokens(row.tokens))
                        .frame(width: 80, alignment: .trailing)
                        .foregroundStyle(Linear.ink2)
                    Text(Formatters.cost(millicents: row.cost))
                        .frame(width: 90, alignment: .trailing)
                        .foregroundStyle(Linear.ink0)
                    if let d = delta {
                        let up = d >= 0
                        Text(String(format: "%@%.0f%%", up ? "+" : "", d * 100))
                            .frame(width: 60, alignment: .trailing)
                            .foregroundStyle(up ? Linear.danger : Linear.success)
                    } else {
                        Text("—")
                            .frame(width: 60, alignment: .trailing)
                            .foregroundStyle(Linear.ink3)
                    }
                }
                .font(.system(size: 12, design: .monospaced))
                .padding(.horizontal, 16).padding(.vertical, 10)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Linear.divider).frame(height: 0.5)
                }
            }
            if data.isEmpty {
                Text("No weekly data")
                    .font(.system(size: 12))
                    .foregroundStyle(Linear.ink3)
                    .padding(20)
            }
        }
    }
}

// MARK: - Rules

public struct RulesTab: View {
    @State private var registry = RuleRegistryFactory.allRules()
    public init() {}
    public var body: some View {
        Panel(title: "Detection rules", subtitle: "All registered rules",
              padding: false, accent: Linear.accent) {
            VStack(spacing: 0) {
                ForEach(Array(registry.rules.values.sorted { $0.id < $1.id }), id: \.id) { rule in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(rule.id)
                                .font(.system(size: 12.5, design: .monospaced))
                                .foregroundStyle(Linear.ink0)
                            Text(rule.triggers.map(\.rawValue).joined(separator: ", "))
                                .font(.system(size: 11))
                                .foregroundStyle(Linear.ink3)
                        }
                        Spacer()
                        Chip(rule.defaultSeverity.rawValue.uppercased(),
                             kind: severityChipKind(rule.defaultSeverity))
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                    .overlay(alignment: .bottom) {
                        Rectangle().fill(Linear.divider).frame(height: 0.5)
                    }
                }
            }
        }
    }

    private func severityChipKind(_ s: Severity) -> ChipKind {
        switch s {
        case .info: return .info
        case .warn: return .warn
        case .block: return .danger
        }
    }
}

// MARK: - Attribution

public struct AttributionTab: View {
    @Environment(AppStore.self) private var store
    @State private var rows: [AttributionRow] = []
    @State private var commits: [CommitAttributionRow] = []
    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            prPanel
            commitsPanel
        }
        .onAppear(perform: load)
        .onChange(of: store.aggregates.allTime.sessionCount) { _, _ in load() }
    }

    private var prPanel: some View {
        Group {
            if rows.isEmpty {
                Panel {
                    VStack(spacing: 8) {
                        Image(systemName: "person.2")
                            .font(.system(size: 28))
                            .foregroundStyle(Linear.ink3)
                        Text("No PR attributions yet")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Linear.ink1)
                        Text("Merged PRs polled from `gh pr list` are correlated to sessions by branch.")
                            .font(.system(size: 11))
                            .foregroundStyle(Linear.ink3)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity).padding(30)
                }
            } else {
                Panel(title: "PR attributions", subtitle: "Most recent first",
                      padding: false, accent: Linear.success) {
                    VStack(spacing: 0) {
                        HStack(spacing: 12) {
                            Text("REPO").frame(width: 200, alignment: .leading)
                            Text("PR").frame(width: 72, alignment: .leading)
                            Text("TITLE").frame(maxWidth: .infinity, alignment: .leading)
                            Text("SESSIONS").frame(width: 80, alignment: .trailing)
                            Text("COST").frame(width: 80, alignment: .trailing)
                        }
                        .font(.system(size: 10.5, weight: .medium))
                        .tracking(1.0)
                        .foregroundStyle(Linear.ink3)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(Linear.divider).frame(height: 0.5)
                        }
                        ForEach(rows) { r in
                            HStack(spacing: 12) {
                                Text(r.repo)
                                    .frame(width: 200, alignment: .leading)
                                    .foregroundStyle(Linear.ink1)
                                    .lineLimit(1)
                                PRLinkButton(repo: r.repo, pr: r.pr)
                                    .frame(width: 72, alignment: .leading)
                                Text(r.title ?? "—")
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .foregroundStyle(r.title == nil ? Linear.ink3 : Linear.ink1)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .help(r.title ?? "")
                                Text("\(r.sessionCount)").frame(width: 80, alignment: .trailing)
                                    .foregroundStyle(Linear.ink2)
                                Text(Formatters.cost(millicents: r.cost))
                                    .frame(width: 80, alignment: .trailing)
                                    .foregroundStyle(Linear.ink0)
                            }
                            .font(.system(size: 12, design: .monospaced))
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(Linear.divider).frame(height: 0.5)
                            }
                        }
                    }
                }
            }
        }
    }

    private var commitsPanel: some View {
        Group {
            if commits.isEmpty {
                EmptyView()
            } else {
                Panel(title: "Commit attributions",
                      subtitle: "Commits linked to the AI session that was active when they landed",
                      padding: false, accent: Linear.info) {
                    VStack(spacing: 0) {
                        HStack(spacing: 12) {
                            Text("REPO").frame(width: 200, alignment: .leading)
                            Text("COMMIT").frame(width: 90, alignment: .leading)
                            Text("SUBJECT").frame(maxWidth: .infinity, alignment: .leading)
                            Text("BRANCH").frame(width: 160, alignment: .leading)
                            Text("WHEN").frame(width: 80, alignment: .trailing)
                            Text("COST").frame(width: 80, alignment: .trailing)
                        }
                        .font(.system(size: 10.5, weight: .medium))
                        .tracking(1.0)
                        .foregroundStyle(Linear.ink3)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(Linear.divider).frame(height: 0.5)
                        }
                        ForEach(commits) { c in
                            HStack(spacing: 12) {
                                Text(c.repo).frame(width: 200, alignment: .leading)
                                    .foregroundStyle(Linear.ink1).lineLimit(1)
                                CommitLinkButton(repo: c.repo, sha: c.sha)
                                    .frame(width: 90, alignment: .leading)
                                Text(c.subject ?? "—")
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .foregroundStyle(c.subject == nil ? Linear.ink3 : Linear.ink1)
                                    .lineLimit(1)
                                    .help(c.subject ?? "")
                                Text(c.branch ?? "—")
                                    .frame(width: 160, alignment: .leading)
                                    .foregroundStyle(Linear.ink2)
                                    .lineLimit(1)
                                Text(Self.relativeTime(ms: c.committedAt))
                                    .frame(width: 80, alignment: .trailing)
                                    .foregroundStyle(Linear.ink3)
                                Text(Formatters.cost(millicents: c.cost))
                                    .frame(width: 80, alignment: .trailing)
                                    .foregroundStyle(Linear.ink0)
                            }
                            .font(.system(size: 12, design: .monospaced))
                            .padding(.horizontal, 16).padding(.vertical, 10)
                            .overlay(alignment: .bottom) {
                                Rectangle().fill(Linear.divider).frame(height: 0.5)
                            }
                        }
                    }
                }
            }
        }
    }

    private func load() {
        guard let db = store.db else { return }
        rows = (try? db.queue.read { db in
            try Row.fetchAll(db, sql: """
                SELECT pa.pr_number, pa.repo,
                  COUNT(DISTINCT pa.session_id) as c,
                  COALESCE(SUM(s.cost_millicents),0) as cost,
                  (SELECT title FROM git_events ge
                   WHERE ge.repo = pa.repo AND ge.pr_number = pa.pr_number
                     AND ge.title IS NOT NULL
                   ORDER BY ge.created_at DESC LIMIT 1) as title
                FROM pr_attributions pa
                JOIN sessions s ON s.id = pa.session_id
                GROUP BY pa.pr_number, pa.repo
                ORDER BY MAX(s.started_at) DESC
                LIMIT 100
                """).compactMap { row in
                guard let pr: Int = row["pr_number"],
                      let repo: String = row["repo"],
                      let count: Int = row["c"],
                      let cost: Int = row["cost"] else { return nil }
                return AttributionRow(pr: pr, repo: repo,
                                      title: row["title"] as String?,
                                      sessionCount: count, cost: cost)
            }
        }) ?? []

        commits = (try? db.queue.read { db in
            try Row.fetchAll(db, sql: """
                SELECT ca.commit_sha, ca.repo, ca.branch, ca.subject, ca.committed_at,
                  COALESCE(s.cost_millicents, 0) as cost
                FROM commit_attributions ca
                LEFT JOIN sessions s ON s.id = ca.session_id
                ORDER BY ca.committed_at DESC
                LIMIT 100
                """).compactMap { row in
                guard let sha: String = row["commit_sha"],
                      let repo: String = row["repo"],
                      let committedAt: Int64 = row["committed_at"] else { return nil }
                return CommitAttributionRow(
                    sha: sha, repo: repo,
                    branch: row["branch"] as String?,
                    subject: row["subject"] as String?,
                    committedAt: committedAt,
                    cost: (row["cost"] as Int?) ?? 0)
            }
        }) ?? []
    }

    private static func relativeTime(ms: Int64) -> String {
        let secs = Int(Date().timeIntervalSince1970) - Int(ms / 1000)
        if secs < 3600 { return "\(max(0, secs / 60))m ago" }
        if secs < 86_400 { return "\(secs / 3600)h ago" }
        if secs < 30 * 86_400 { return "\(secs / 86_400)d ago" }
        return "\(secs / (30 * 86_400))mo ago"
    }
}

struct CommitAttributionRow: Identifiable {
    let sha: String
    let repo: String
    let branch: String?
    let subject: String?
    let committedAt: Int64
    let cost: Int
    var id: String { "\(repo)@\(sha)" }
}

private struct CommitLinkButton: View {
    let repo: String
    let sha: String
    @State private var hover = false

    var body: some View {
        Button(action: open) {
            HStack(spacing: 4) {
                Text(String(sha.prefix(7)))
                    .font(.system(size: 12, design: .monospaced))
                    .underline(true, color: Linear.accent.opacity(hover ? 1.0 : 0.5))
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundStyle(Linear.accent)
            .opacity(hover ? 1.0 : 0.85)
        }
        .buttonStyle(.plain)
        .onHover { hov in
            hover = hov
            if hov { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .help("Open commit \(String(sha.prefix(7))) on GitHub")
    }

    private func open() {
        guard let url = URL(string: "https://github.com/\(repo)/commit/\(sha)") else { return }
        NSWorkspace.shared.open(url)
    }
}

struct AttributionRow: Identifiable {
    let pr: Int
    let repo: String
    let title: String?
    let sessionCount: Int
    let cost: Int
    var id: String { "\(repo)#\(pr)" }
}

private struct PRLinkButton: View {
    let repo: String
    let pr: Int
    @State private var hover = false

    var body: some View {
        Button(action: open) {
            HStack(spacing: 4) {
                Text("#" + String(pr))
                    .font(.system(size: 12, design: .monospaced))
                    .underline(true, color: Linear.accent.opacity(hover ? 1.0 : 0.5))
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 10, weight: .medium))
            }
            .foregroundStyle(Linear.accent)
            .opacity(hover ? 1.0 : 0.85)
        }
        .buttonStyle(.plain)
        .onHover { hov in
            hover = hov
            if hov { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .help("Open PR #\(String(pr)) on GitHub")
    }

    private func open() {
        guard let url = URL(string: "https://github.com/\(repo)/pull/\(pr)") else { return }
        NSWorkspace.shared.open(url)
    }
}

// MARK: - Hooks

public struct HooksTab: View {
    @Environment(AppStore.self) private var store
    @State private var status: HookStatus = HookStatus(installed: false, kinds: [])
    @State private var message: String?
    public init() {}

    public var body: some View {
        Panel(title: "Claude Code hook",
              subtitle: "Runs detection rules on every Claude Code event",
              accent: Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255)) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 10) {
                    Image(systemName: status.installed ? "checkmark.seal.fill" : "exclamationmark.triangle")
                        .foregroundStyle(status.installed ? Linear.success : Linear.warn)
                    Text(status.installed ? "Installed" : "Not installed")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Linear.ink0)
                    Spacer()
                    LinearButton("Install", primary: true) { install() }
                    LinearButton("Uninstall") { uninstall() }
                    LinearButton("Refresh", ghost: true) { refreshStatus() }
                }
                if !status.kinds.isEmpty {
                    Text("Hooks active: " + status.kinds.joined(separator: ", "))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                }
                if let message {
                    Text(message)
                        .font(.system(size: 11))
                        .foregroundStyle(Linear.info)
                }
            }
        }
        .onAppear(perform: refreshStatus)
    }

    private var settingsPath: URL { HookInstaller.defaultSettingsURL(global: true) }
    private var hookBinary: URL {
        Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/tokscale-hook")
    }
    private func refreshStatus() { status = HookInstaller.status(at: settingsPath) }
    private func install() {
        do {
            try HookInstaller.install(at: settingsPath, hookBinary: hookBinary)
            message = "Installed at \(settingsPath.path)"
        } catch {
            message = "Install failed: \(error.localizedDescription)"
        }
        refreshStatus()
    }
    private func uninstall() {
        do {
            try HookInstaller.uninstall(at: settingsPath)
            message = "Uninstalled"
        } catch {
            message = "Uninstall failed: \(error.localizedDescription)"
        }
        refreshStatus()
    }
}

// MARK: - Helpers

private func splitCost(_ millicents: Int) -> (String, String) {
    let dollars = millicents / 100_000
    let rem = millicents % 100_000
    let cents = Int((Double(rem) / 1000.0).rounded())
    return ("\(dollars)", String(format: ".%02d", cents))
}

private func projectMonth(agg: Core.SessionStore.Aggregates) -> Int {
    let cal = Calendar.current
    let day = cal.component(.day, from: Date())
    let monthRange = cal.range(of: .day, in: .month, for: Date())?.count ?? 30
    let startOfMonth = cal.date(from: cal.dateComponents([.year, .month], from: Date())) ?? Date()
    let monthSpend = agg.dailyStats.reduce(0) { acc, d in
        if let date = isoDate(d.date), date >= startOfMonth { return acc + d.costMillicents }
        return acc
    }
    guard day > 0 else { return monthSpend }
    return Int(Double(monthSpend) / Double(day) * Double(monthRange))
}

private func isoDate(_ s: String) -> Date? {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
    return f.date(from: s)
}

private func modelShort(_ model: String) -> String {
    model.replacingOccurrences(of: "claude-", with: "")
         .replacingOccurrences(of: "anthropic/", with: "")
}

private struct SessionDetailInline: View {
    @Environment(AppStore.self) private var store
    let session: SessionSummary
    var onShowTranscript: () -> Void = {}

    var body: some View {
        let turns = store.store.turns(for: session.id)
        let cacheTotal = session.cacheReadTokens + session.cacheWriteTokens
        let totalIn = session.inputTokens + cacheTotal
        let cachePct = totalIn > 0 ? Int(Double(session.cacheReadTokens) / Double(totalIn) * 100) : 0
        let duration = Int(max(0, session.durationSeconds))
        let durStr: String = {
            if duration < 60 { return "\(duration)s" }
            if duration < 3600 { return "\(duration/60)m \(duration%60)s" }
            let h = duration / 3600, m = (duration % 3600) / 60
            return "\(h)h \(m)m"
        }()
        let avgCost = session.turnCount > 0 ? session.costMillicents / session.turnCount : 0
        let avgTokens = session.turnCount > 0
            ? (session.inputTokens + session.outputTokens) / session.turnCount : 0

        VStack(alignment: .leading, spacing: 16) {
            // Hero row
            HStack(alignment: .top, spacing: 24) {
                DetailCell(label: "ID", value: session.id, mono: true)
                DetailCell(label: "Duration", value: durStr)
                DetailCell(label: "Started", value: sessionDateFormatter.string(from: session.startedAt))
                DetailCell(label: "Ended", value: sessionDateFormatter.string(from: session.endedAt))
                DetailCell(label: "Turns", value: "\(session.turnCount)")
                Spacer()
                TranscriptButton(turnCount: session.turnCount, action: onShowTranscript)
            }

            Divider().overlay(Linear.divider)

            // Tokens timeline
            SessionTokensChart(turns: turns)
                .frame(height: 140)

            // Token breakdown
            VStack(alignment: .leading, spacing: 8) {
                Text("TOKEN BREAKDOWN")
                    .font(.system(size: 10, weight: .semibold)).tracking(1)
                    .foregroundStyle(Linear.ink3)
                HStack(spacing: 24) {
                    DetailCell(label: "Input", value: Formatters.tokens(session.inputTokens))
                    DetailCell(label: "Output", value: Formatters.tokens(session.outputTokens))
                    DetailCell(label: "Cache read", value: Formatters.tokens(session.cacheReadTokens))
                    DetailCell(label: "Cache write", value: Formatters.tokens(session.cacheWriteTokens))
                    DetailCell(label: "Cache hit", value: "\(cachePct)%",
                               valueColor: cachePct >= 70 ? Linear.success
                                           : (cachePct >= 30 ? Linear.warn : Linear.ink0))
                }
            }

            // Cost breakdown
            VStack(alignment: .leading, spacing: 8) {
                Text("COST")
                    .font(.system(size: 10, weight: .semibold)).tracking(1)
                    .foregroundStyle(Linear.ink3)
                HStack(spacing: 24) {
                    DetailCell(label: "Total", value: Formatters.cost(millicents: session.costMillicents),
                               valueColor: Linear.success)
                    DetailCell(label: "Avg / turn", value: Formatters.cost(millicents: avgCost))
                    DetailCell(label: "Avg tokens / turn",
                               value: Formatters.tokens(avgTokens))
                    DetailCell(label: "Tool", value: session.tool.rawValue, mono: true)
                }
            }

            // Models list
            if !session.models.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("MODELS USED")
                        .font(.system(size: 10, weight: .semibold)).tracking(1)
                        .foregroundStyle(Linear.ink3)
                    HStack(spacing: 8) {
                        ForEach(session.models, id: \.self) { m in
                            let perModel = turns.filter { $0.model == m }
                            let turnsWithModel = perModel.count
                            let costOfModel = perModel.reduce(0) { $0 + $1.costMillicents }
                            HStack(spacing: 6) {
                                Swatch(Linear.modelColor(m))
                                Text(m)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(Linear.ink0)
                                Text("\(turnsWithModel) turn\(turnsWithModel == 1 ? "" : "s")")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(Linear.ink3)
                                Text("·").foregroundStyle(Linear.ink4)
                                Text(Formatters.cost(millicents: costOfModel))
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(Linear.ink2)
                            }
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Linear.panel)
                            .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
                        }
                        Spacer(minLength: 0)
                    }
                }
            }

            // Repo / cwd
            if session.gitRepo != nil || session.cwd != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text("CONTEXT")
                        .font(.system(size: 10, weight: .semibold)).tracking(1)
                        .foregroundStyle(Linear.ink3)
                    HStack(spacing: 12) {
                        if let repo = session.gitRepo {
                            contextChip(icon: "folder", text: repo)
                        }
                        if let b = session.gitBranch {
                            contextChip(icon: "arrow.triangle.branch", text: b)
                        }
                        if let cwd = session.cwd {
                            contextChip(icon: "terminal", text: cwd, faded: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .padding(.horizontal, 20).padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Linear.panel2)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Linear.divider).frame(height: 0.5)
        }
    }

    private func contextChip(icon: String, text: String, faded: Bool = false) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 10))
                .foregroundStyle(Linear.ink3)
            Text(text)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(faded ? Linear.ink2 : Linear.ink1)
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(.horizontal, 8).padding(.vertical, 4)
        .background(Linear.panel)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

/// Line chart showing cumulative tokens across the turns of a single session.
/// X axis is clock time of each turn (minutes since session start); Y is
/// cumulative total tokens (input + output + cache read + cache write).
private struct SessionTokensChart: View {
    let turns: [Session]
    @State private var hoverX: CGFloat? = nil

    var body: some View {
        if turns.isEmpty {
            emptyState
        } else {
            chart
        }
    }

    private var emptyState: some View {
        HStack {
            Spacer()
            Text("No per-turn data available")
                .font(.system(size: 11))
                .foregroundStyle(Linear.ink3)
            Spacer()
        }
        .frame(maxHeight: .infinity)
    }

    private var chart: some View {
        let start = turns.first?.startedAt ?? Date()
        let total = max(1, turns.last?.startedAt.timeIntervalSince(start) ?? 1)
        var cumOut: Double = 0, cumIn: Double = 0
        var outPts: [(Double, Double)] = []   // (t, cumulative output tokens)
        var inPts: [(Double, Double)] = []    // (t, cumulative input + cache tokens)
        for t in turns {
            cumOut += Double(t.outputTokens)
            cumIn += Double(t.inputTokens + t.cacheReadTokens + t.cacheWriteTokens)
            let x = t.startedAt.timeIntervalSince(start) / total
            outPts.append((x, cumOut))
            inPts.append((x, cumIn))
        }
        let maxY = max(cumIn, cumOut, 1)

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 14) {
                Text("TOKENS OVER TIME")
                    .font(.system(size: 10, weight: .semibold)).tracking(1)
                    .foregroundStyle(Linear.ink3)
                Spacer()
                HStack(spacing: 4) {
                    Circle().fill(Linear.info).frame(width: 6, height: 6)
                    Text("input + cache")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                }
                HStack(spacing: 4) {
                    Circle().fill(Linear.accent).frame(width: 6, height: 6)
                    Text("output")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                }
            }

            GeometryReader { geo in
                let w = geo.size.width, h = geo.size.height
                ZStack {
                    linePath(pts: inPts, maxY: maxY, size: geo.size)
                        .stroke(Linear.info,
                                style: StrokeStyle(lineWidth: 1.6,
                                                   lineCap: .round, lineJoin: .round))
                    linePath(pts: outPts, maxY: maxY, size: geo.size)
                        .stroke(Linear.accent,
                                style: StrokeStyle(lineWidth: 1.6,
                                                   lineCap: .round, lineJoin: .round))
                    ForEach(0..<turns.count, id: \.self) { i in
                        let x = CGFloat(inPts[i].0) * w
                        let y = h - CGFloat(inPts[i].1 / maxY) * (h - 8) - 4
                        Circle()
                            .fill(Linear.info)
                            .frame(width: 3, height: 3)
                            .position(x: x, y: y)
                    }
                    if let hx = hoverX, let idx = nearestIndex(hx: hx, pts: inPts, w: w) {
                        let x = CGFloat(inPts[idx].0) * w
                        Rectangle().fill(Linear.ink3.opacity(0.3))
                            .frame(width: 1).position(x: x, y: h / 2)
                        ChartTooltip(
                            label: timeLabel(turns[idx].startedAt, from: start),
                            value: "\(Formatters.tokens(Int(inPts[idx].1))) in · " +
                                   "\(Formatters.tokens(Int(outPts[idx].1))) out"
                        )
                        .fixedSize()
                        .position(x: min(max(x, 80), w - 80), y: 20)
                    }
                }
                .contentShape(Rectangle())
                .onContinuousHover { phase in
                    switch phase {
                    case .active(let pt): hoverX = pt.x
                    case .ended: hoverX = nil
                    }
                }
            }
        }
    }

    private func linePath(pts: [(Double, Double)], maxY: Double, size: CGSize) -> Path {
        var p = Path()
        guard !pts.isEmpty else { return p }
        for (i, pt) in pts.enumerated() {
            let x = CGFloat(pt.0) * size.width
            let y = size.height - CGFloat(pt.1 / maxY) * (size.height - 8) - 4
            if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
            else { p.addLine(to: CGPoint(x: x, y: y)) }
        }
        return p
    }

    private func nearestIndex(hx: CGFloat, pts: [(Double, Double)], w: CGFloat) -> Int? {
        guard !pts.isEmpty else { return nil }
        var best = 0
        var bestD = CGFloat.greatestFiniteMagnitude
        for (i, pt) in pts.enumerated() {
            let d = abs(CGFloat(pt.0) * w - hx)
            if d < bestD { bestD = d; best = i }
        }
        return best
    }

    private func timeLabel(_ d: Date, from start: Date) -> String {
        let secs = Int(d.timeIntervalSince(start))
        if secs < 60 { return "+\(secs)s" }
        if secs < 3600 { return "+\(secs/60)m" }
        return "+\(secs/3600)h \((secs % 3600) / 60)m"
    }
}

private struct DetailCell: View {
    let label: String
    let value: String
    var mono: Bool = false
    var valueColor: Color = Linear.ink0
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label.uppercased())
                .font(.system(size: 9.5, weight: .semibold)).tracking(1)
                .foregroundStyle(Linear.ink3)
            Text(value)
                .font(.system(size: 12, weight: .medium,
                              design: mono ? .monospaced : .default))
                .foregroundStyle(valueColor)
                .lineLimit(1)
        }
    }
}

private struct TranscriptButton: View {
    let turnCount: Int
    let action: () -> Void
    @State private var hover = false
    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                ZStack {
                    Rectangle()
                        .fill(Linear.accent.opacity(hover ? 0.22 : 0.14))
                        .frame(width: 26, height: 26)
                    Image(systemName: "text.bubble")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Linear.accent)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text("View transcript")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Linear.ink0)
                    Text("\(turnCount) message\(turnCount == 1 ? "" : "s")")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                }
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Linear.ink3)
                    .padding(.leading, 4)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(hover ? Linear.panelHi : Linear.panel)
            .overlay(Rectangle().stroke(
                hover ? Linear.accent.opacity(0.4) : Linear.border,
                lineWidth: 0.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

// MARK: - Transcript screen (inline, breadcrumb back)

struct TranscriptScreen: View {
    @Environment(AppStore.self) private var appStore
    let session: SessionSummary
    let onBack: () -> Void
    @State private var messages: [ConversationMessage] = []
    @State private var loadError: String? = nil
    @State private var loading: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Breadcrumb
            HStack(spacing: 6) {
                Button(action: onBack) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 10, weight: .semibold))
                        Text("Sessions")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(Linear.info)
                    .padding(.horizontal, 8).padding(.vertical, 4)
                    .background(Linear.panel)
                    .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)

                Image(systemName: "chevron.right")
                    .font(.system(size: 9))
                    .foregroundStyle(Linear.ink3)
                Text(String(session.id.prefix(12)))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Linear.ink2)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)

            // Session meta
            HStack(spacing: 10) {
                Swatch(Linear.modelColor(session.primaryModel))
                Text(session.primaryModel)
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Linear.modelColor(session.primaryModel))
                Chip(session.tool.rawValue, kind: toolChipKind(session.tool))
                Text("·").foregroundStyle(Linear.ink4)
                Text("\(session.turnCount) turns")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Linear.ink2)
                Text("·").foregroundStyle(Linear.ink4)
                Text(Formatters.cost(millicents: session.costMillicents))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Linear.success)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.bottom, 10)
            .overlay(alignment: .bottom) {
                Rectangle().fill(Linear.divider).frame(height: 0.5)
            }

            // Messages
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = loadError {
                Text("Failed to load: \(err)")
                    .font(.system(size: 12))
                    .foregroundStyle(Linear.danger)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if messages.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "text.bubble")
                        .font(.system(size: 28))
                        .foregroundStyle(Linear.ink3)
                    Text("No transcript captured")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Linear.ink1)
                    Text("Message bodies are only stored when Tokscale's hook or capture pipeline ran during this session.")
                        .font(.system(size: 11))
                        .foregroundStyle(Linear.ink3)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 360)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(messages) { msg in
                            MessageRow(message: msg)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 12)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Linear.bg0)
        .onAppear(perform: load)
    }

    private func load() {
        guard let db = appStore.db else {
            loading = false
            loadError = "Database not available"
            return
        }
        do {
            messages = try MessagesRepo(db: db).byConversation(session.id)
            loading = false
        } catch {
            loadError = error.localizedDescription
            loading = false
        }
    }
}

private enum MessageBlockKind {
    case text
    case toolUse(tool: String)
    case toolResult(id: String)
    case thinking
}

private struct MessageBlock {
    let kind: MessageBlockKind
    let body: String
}

/// Split a stored message into typed blocks. The persisted content is a
/// line-oriented serialization of Anthropic's content blocks — each block
/// opens with a `[tool_use: X]`, `[tool_result (id)]`, `[thinking]`, or
/// `[Image: ...]` marker, followed by its body.
private func parseBlocks(_ raw: String) -> [MessageBlock] {
    let markerRegex = try! NSRegularExpression(
        pattern: #"^\[(tool_use: ([^\]]+)|tool_result \(([^)]+)\)|thinking)\]\s*$"#,
        options: [.anchorsMatchLines])
    let ns = raw as NSString
    let matches = markerRegex.matches(in: raw, range: NSRange(location: 0, length: ns.length))
    guard !matches.isEmpty else {
        return [MessageBlock(kind: .text, body: raw.trimmingCharacters(in: .whitespacesAndNewlines))]
    }
    var blocks: [MessageBlock] = []
    // Prefix text before the first marker (rare — usually empty).
    let firstRange = matches.first!.range
    if firstRange.location > 0 {
        let prefix = ns.substring(with: NSRange(location: 0, length: firstRange.location))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !prefix.isEmpty {
            blocks.append(MessageBlock(kind: .text, body: prefix))
        }
    }
    for (i, m) in matches.enumerated() {
        let markerLine = ns.substring(with: m.range)
        let bodyStart = m.range.location + m.range.length
        let bodyEnd = (i + 1 < matches.count) ? matches[i + 1].range.location : ns.length
        let body = ns.substring(with: NSRange(location: bodyStart, length: bodyEnd - bodyStart))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let kind: MessageBlockKind
        if markerLine.contains("tool_use:") {
            let tool = m.range(at: 2).location != NSNotFound
                ? ns.substring(with: m.range(at: 2))
                : "tool"
            kind = .toolUse(tool: tool)
        } else if markerLine.contains("tool_result") {
            let id = m.range(at: 3).location != NSNotFound
                ? ns.substring(with: m.range(at: 3))
                : ""
            kind = .toolResult(id: id)
        } else {
            kind = .thinking
        }
        blocks.append(MessageBlock(kind: kind, body: body))
    }
    return blocks
}

private struct MessageRow: View {
    let message: ConversationMessage

    var body: some View {
        let (roleColor, roleKind): (Color, ChipKind) = {
            switch message.role.lowercased() {
            case "user":      return (Linear.accent, .accent)
            case "assistant": return (Linear.info, .info)
            case "system":    return (Linear.warn, .warn)
            default:          return (Linear.ink2, .ghost)
            }
        }()
        let tokenTotal = message.inputTokens + message.outputTokens
            + message.cacheRead + message.cacheWrite

        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Chip(message.role.uppercased(), kind: roleKind)
                Text("#\(message.turnIndex)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Linear.ink3)
                Spacer()
                if tokenTotal > 0 {
                    Text("\(Formatters.tokens(tokenTotal)) tok")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                }
                Text(message.createdAt.formatted(date: .omitted, time: .standard))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(Linear.ink3)
            }

            if let content = message.content, !content.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(parseBlocks(content).enumerated()), id: \.offset) { _, block in
                        MessageBlockView(block: block, roleColor: roleColor)
                    }
                }
            } else {
                Text("(content redacted — only hash stored)")
                    .font(.system(size: 11))
                    .italic()
                    .foregroundStyle(Linear.ink3)
                    .padding(.horizontal, 10).padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Linear.panel)
                    .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
            }
        }
        .padding(.vertical, 6)
    }
}

private struct MessageBlockView: View {
    let block: MessageBlock
    let roleColor: Color

    var body: some View {
        switch block.kind {
        case .text:
            Text(block.body)
                .font(.system(size: 12))
                .foregroundStyle(Linear.ink1)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(Linear.panel)
                .overlay(Rectangle().stroke(roleColor.opacity(0.15), lineWidth: 0.5))

        case .toolUse(let tool):
            blockCard(
                label: "TOOL USE",
                name: tool,
                accent: Linear.info,
                body: block.body,
                monospaced: true)

        case .toolResult(let id):
            blockCard(
                label: "TOOL RESULT",
                name: id.isEmpty ? nil : String(id.prefix(8)),
                accent: Linear.success,
                body: block.body,
                monospaced: true)

        case .thinking:
            blockCard(
                label: "THINKING",
                name: nil,
                accent: Linear.warn,
                body: block.body,
                monospaced: false,
                italic: true)
        }
    }

    private func blockCard(
        label: String,
        name: String?,
        accent: Color,
        body: String,
        monospaced: Bool,
        italic: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(label)
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .tracking(0.8)
                    .foregroundStyle(accent)
                if let name {
                    Text(name)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink2)
                }
            }
            Text(body)
                .font(monospaced
                    ? .system(size: 11, design: .monospaced)
                    : .system(size: 12))
                .italic(italic)
                .foregroundStyle(Linear.ink1)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(accent.opacity(0.05))
        .overlay(alignment: .leading) {
            Rectangle().fill(accent.opacity(0.6)).frame(width: 2)
        }
        .overlay(Rectangle().stroke(accent.opacity(0.2), lineWidth: 0.5))
    }
}

private func toolShort(_ t: Tool) -> String {
    switch t {
    case .claudeCode: return "claude"
    case .codex:      return "codex"
    case .geminiCli:  return "gemini"
    case .opencode:   return "opencode"
    }
}

private func toolChipKind(_ t: Tool) -> ChipKind {
    switch t {
    case .claudeCode: return .accent
    case .codex:      return .success
    case .geminiCli:  return .info
    case .opencode:   return .warn
    }
}

private func hourLabel(_ h: Int) -> String {
    if h == 0 { return "12a" }
    if h < 12 { return "\(h)a" }
    if h == 12 { return "12p" }
    return "\(h - 12)p"
}

private func shortSessionId(_ id: String) -> String {
    if id.count <= 12 { return id }
    return String(id.prefix(10)) + "…"
}

struct StatCard: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .tracking(1.0)
                .foregroundStyle(Linear.ink3)
            Text(value)
                .font(.system(size: 16, weight: .medium, design: .monospaced))
                .foregroundStyle(Linear.ink0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Linear.panel2)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}
