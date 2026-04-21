import SwiftUI
import Core
import Storage
import GRDB

// MARK: - Stats model

public struct ActivityStats: Sendable, Hashable {
    public var sessions: Int
    public var messages: Int
    public var totalTokens: Int
    public var activeDays: Int
    public var currentStreak: Int
    public var longestStreak: Int
    public var peakHour: Int?       // 0-23 in local time
    public var favoriteModel: String?
    /// One cell per day of the current year. Cells after "today" are flagged
    /// `isFuture` so the grid can render them as placeholders.
    public var yearCells: [YearCell]
}

public struct YearCell: Sendable, Hashable {
    public var value: Int
    public var isFuture: Bool
}

enum ActivityStatsCalculator {
    /// Gathers hero-strip metrics for the given window. KPIs respect `range`
    /// (ALL / 30D / 7D); the year heatmap always covers Jan 1 → Dec 31 of the
    /// current calendar year so cells read as a contribution-graph-style view.
    static func compute(db: AppDB?, dailyStats: [DayStats], models: [ModelStats],
                        range: OverviewRange) -> ActivityStats {
        let yearCells = buildYearCells(db: db)
        let windowDaily: [Int] = {
            switch range {
            case .all:
                return yearCells.prefix(while: { !$0.isFuture }).map { $0.value }
            case .last30, .last7:
                let days = range.heatmapDays
                let past = yearCells.prefix(while: { !$0.isFuture }).map { $0.value }
                let tail = Array(past.suffix(days))
                return tail
            }
        }()

        let activeDays = windowDaily.filter { $0 > 0 }.count
        let currentStreak = Self.currentStreak(daily: yearCells.prefix(while: { !$0.isFuture }).map { $0.value })
        let longestStreak = Self.longestStreak(daily: yearCells.map { $0.value })

        let (sessions, messages, totalTokens, peakHour): (Int, Int, Int, Int?) = {
            guard let db else { return (0, 0, 0, nil) }
            return (try? db.queue.read { db -> (Int, Int, Int, Int?) in
                let cutoff = Self.cutoffMs(range: range)
                let sessionsCount: Int = try Int.fetchOne(db, sql: """
                    SELECT COUNT(DISTINCT conversation_id) FROM sessions
                    WHERE started_at >= ?
                    """, arguments: [cutoff]) ?? 0
                let messagesCount: Int = try Int.fetchOne(db, sql: """
                    SELECT COUNT(*) FROM messages WHERE created_at >= ?
                    """, arguments: [cutoff]) ?? 0
                let tokens: Int = try Int.fetchOne(db, sql: """
                    SELECT COALESCE(SUM(input_tokens + output_tokens + cache_read + cache_write), 0)
                    FROM sessions WHERE started_at >= ?
                    """, arguments: [cutoff]) ?? 0
                let peak: Int? = try Row.fetchOne(db, sql: """
                    SELECT CAST((started_at / 1000) % 86400 / 3600 AS INTEGER) AS h,
                           SUM(cost_millicents) AS cost
                    FROM sessions WHERE started_at >= ? GROUP BY h
                    ORDER BY cost DESC LIMIT 1
                    """, arguments: [cutoff])?["h"]
                return (sessionsCount, messagesCount, tokens, peak)
            }) ?? (0, 0, 0, nil)
        }()

        let favorite = range.usesAllTimeModels
            ? models.first?.model
            : Self.favoriteModelInWindow(db: db, cutoffMs: Self.cutoffMs(range: range)) ?? models.first?.model

        return ActivityStats(
            sessions: sessions,
            messages: messages,
            totalTokens: totalTokens,
            activeDays: activeDays,
            currentStreak: currentStreak,
            longestStreak: longestStreak,
            peakHour: peakHour,
            favoriteModel: favorite,
            yearCells: yearCells)
    }

    /// Build one `YearCell` per day from Jan 1 to Dec 31 of the current year,
    /// in local time. Past/today cells carry the summed `cost_millicents` for
    /// that day; future cells are placeholders that render as empty squares.
    private static func buildYearCells(db: AppDB?) -> [YearCell] {
        let cal = Calendar.current
        let now = Date()
        let year = cal.component(.year, from: now)
        guard let jan1 = cal.date(from: DateComponents(year: year, month: 1, day: 1)),
              let dec31 = cal.date(from: DateComponents(year: year, month: 12, day: 31))
        else { return [] }
        let startMs = Int(jan1.timeIntervalSince1970 * 1000)
        let nextYearMs = Int(cal.date(byAdding: .year, value: 1, to: jan1)!.timeIntervalSince1970 * 1000)
        let today = cal.startOfDay(for: now)

        var byDay: [String: Int] = [:]
        if let db {
            let rows: [(String, Int)] = (try? db.queue.read { db in
                try Row.fetchAll(db, sql: """
                    SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch', 'localtime') AS d,
                           COALESCE(SUM(cost_millicents), 0) AS c
                    FROM sessions
                    WHERE started_at >= ? AND started_at < ?
                    GROUP BY d
                    """, arguments: [startMs, nextYearMs])
                    .compactMap { row -> (String, Int)? in
                        guard let d: String = row["d"], let c: Int = row["c"] else { return nil }
                        return (d, c)
                    }
            }) ?? []
            for (date, cost) in rows { byDay[date] = cost }
        }

        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        var cells: [YearCell] = []
        var cursor = jan1
        while cursor <= dec31 {
            let key = fmt.string(from: cursor)
            let isFuture = cursor > today
            cells.append(YearCell(
                value: isFuture ? 0 : (byDay[key] ?? 0),
                isFuture: isFuture))
            cursor = cal.date(byAdding: .day, value: 1, to: cursor) ?? dec31.addingTimeInterval(86400)
        }
        return cells
    }

    private static func cutoffMs(range: OverviewRange) -> Int {
        switch range {
        case .all: return 0
        case .last30: return Int(Date().timeIntervalSince1970 * 1000) - 30 * 86_400_000
        case .last7:  return Int(Date().timeIntervalSince1970 * 1000) - 7 * 86_400_000
        }
    }

    private static func favoriteModelInWindow(db: AppDB?, cutoffMs: Int) -> String? {
        guard let db else { return nil }
        return (try? db.queue.read { db -> String? in
            try String.fetchOne(db, sql: """
                SELECT model FROM sessions WHERE started_at >= ?
                GROUP BY model ORDER BY SUM(cost_millicents) DESC LIMIT 1
                """, arguments: [cutoffMs])
        }) ?? nil
    }

    private static func currentStreak(daily: [Int]) -> Int {
        var count = 0
        for v in daily.reversed() {
            if v > 0 { count += 1 } else { break }
        }
        return count
    }

    private static func longestStreak(daily: [Int]) -> Int {
        var best = 0, cur = 0
        for v in daily {
            if v > 0 { cur += 1; best = max(best, cur) } else { cur = 0 }
        }
        return best
    }
}

// MARK: - Range

public enum OverviewRange: Hashable {
    case all, last30, last7

    public static func from(_ raw: String) -> OverviewRange {
        switch raw {
        case "7D": return .last7
        case "30D": return .last30
        default: return .all
        }
    }

    var heatmapDays: Int {
        switch self {
        case .all: return 140   // ~20 weeks, matches the GitHub-style grid
        case .last30: return 30
        case .last7: return 7
        }
    }

    var usesAllTimeModels: Bool { self == .all }
}

// MARK: - Hero section

struct ActivityHeroSection: View {
    @Environment(AppStore.self) private var store
    let range: String

    var body: some View {
        let stats = ActivityStatsCalculator.compute(
            db: store.db,
            dailyStats: store.aggregates.dailyStats,
            models: store.aggregates.models,
            range: OverviewRange.from(range))
        Panel(title: "Activity",
              subtitle: "Range: \(range)",
              trailing: AnyView(
                Text(mobyDickFact(totalTokens: stats.totalTokens))
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(Linear.ink3)),
              accent: Linear.info) {
            VStack(alignment: .leading, spacing: 12) {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4),
                          spacing: 10) {
                    HeroStat(label: "Sessions",      value: "\(stats.sessions)",            color: Linear.info)
                    HeroStat(label: "Messages",      value: Formatters.tokens(stats.messages), color: Linear.accent)
                    HeroStat(label: "Total tokens",  value: Formatters.tokens(stats.totalTokens), color: Linear.success)
                    HeroStat(label: "Active days",   value: "\(stats.activeDays)",           color: Linear.warn)
                    HeroStat(label: "Current streak", value: "\(stats.currentStreak)d",       color: Color(red: 0xb8/255, green: 0xa6/255, blue: 1.0))
                    HeroStat(label: "Longest streak", value: "\(stats.longestStreak)d",       color: Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255))
                    HeroStat(label: "Peak hour",     value: Self.formatHour(stats.peakHour), color: Linear.info)
                    HeroStat(label: "Favorite model", value: Self.shortModel(stats.favoriteModel), color: Linear.accent)
                }
                HeatmapGrid(cells: stats.yearCells)
                    .frame(height: 140)
            }
        }
    }

    private static func formatHour(_ h: Int?) -> String {
        guard let h else { return "—" }
        if h == 0 { return "12 AM" }
        if h == 12 { return "12 PM" }
        return h < 12 ? "\(h) AM" : "\(h - 12) PM"
    }

    private static func shortModel(_ m: String?) -> String {
        guard let m, !m.isEmpty else { return "—" }
        // Drop provider prefix + long version suffixes like "claude-opus-4-5-20250929".
        let trimmed = m.replacingOccurrences(of: "claude-", with: "")
            .replacingOccurrences(of: "gpt-", with: "")
        if let dash = trimmed.firstIndex(of: "-"),
           trimmed.distance(from: trimmed.startIndex, to: dash) > 0 {
            let head = trimmed[..<dash]
            let tail = trimmed[trimmed.index(after: dash)...]
            // Keep major.minor: "opus-4-6" → "opus 4.6"
            let rest = tail.split(separator: "-").prefix(2).joined(separator: ".")
            return "\(head.capitalized) \(rest)"
        }
        return trimmed
    }

    private func mobyDickFact(totalTokens: Int) -> String {
        guard totalTokens > 0 else { return "—" }
        let mobyDick = 210_000
        let ratio = Double(totalTokens) / Double(mobyDick)
        if ratio < 1 {
            let pct = Int(ratio * 100)
            return "That's \(pct)% of Moby-Dick."
        }
        return "That's \(Formatters.tokens(Int(ratio)))× more tokens than Moby-Dick."
    }
}

private struct HeroStat: View {
    let label: String
    let value: String
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle().fill(color).frame(width: 5, height: 5)
                Text(label.uppercased())
                    .font(.system(size: 9.5, weight: .medium, design: .monospaced))
                    .tracking(0.7)
                    .foregroundStyle(Linear.ink3)
            }
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .monospaced))
                .foregroundStyle(Linear.ink0)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Linear.panel2)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

// MARK: - Heatmap

struct HeatmapGrid: View {
    let cells: [YearCell]

    var body: some View {
        let grid = YearGridLayout(cells: cells)
        GeometryReader { geo in
            let spacing: CGFloat = 3
            let cellW = (geo.size.width - spacing * CGFloat(grid.cols - 1)) / CGFloat(grid.cols)
            let cellH = (geo.size.height - spacing * CGFloat(grid.rows - 1)) / CGFloat(grid.rows)
            let cell = min(cellW, cellH)
            let peak = max(1, cells.map { $0.value }.max() ?? 1)

            VStack(alignment: .leading, spacing: spacing) {
                ForEach(0..<grid.rows, id: \.self) { r in
                    HStack(spacing: spacing) {
                        ForEach(0..<grid.cols, id: \.self) { c in
                            let cellData = grid.at(row: r, col: c)
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(bucketColor(cell: cellData, peak: peak))
                                .frame(width: cell, height: cell)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
        }
    }

    private func bucketColor(cell: YearCell?, peak: Int) -> Color {
        // `nil` means the slot is before Jan 1 / after Dec 31 — render as the
        // faint panel background so the grid stays rectangular.
        guard let cell else { return Linear.panelHi.opacity(0.3) }
        if cell.isFuture { return Linear.panelHi.opacity(0.5) }
        if cell.value == 0 { return Linear.panelHi }
        let ratio = Double(cell.value) / Double(peak)
        let alpha: Double
        switch ratio {
        case ..<0.25:  alpha = 0.35
        case ..<0.5:   alpha = 0.55
        case ..<0.75:  alpha = 0.75
        default:       alpha = 1.00
        }
        return Linear.info.opacity(alpha)
    }
}

/// GitHub-style contribution grid layout. Column 0 row 0 is the Monday on or
/// before Jan 1. Each column is a week; each row is a weekday (Mon→Sun).
/// Slots before Jan 1 and after Dec 31 are `nil` so rendering can fade them.
struct YearGridLayout {
    let cells: [YearCell]
    let rows: Int
    let cols: Int
    /// Weekday index of Jan 1 in Mon=0..Sun=6 space.
    private let jan1Row: Int

    init(cells: [YearCell]) {
        self.cells = cells
        self.rows = 7
        self.jan1Row = Self.mondayRowForJan1()
        let totalSlots = jan1Row + cells.count
        self.cols = Int((Double(totalSlots) / 7.0).rounded(.up))
    }

    func at(row: Int, col: Int) -> YearCell? {
        let slot = col * 7 + row
        let idx = slot - jan1Row
        guard idx >= 0, idx < cells.count else { return nil }
        return cells[idx]
    }

    private static func mondayRowForJan1() -> Int {
        let cal = Calendar.current
        let year = cal.component(.year, from: Date())
        guard let jan1 = cal.date(from: DateComponents(year: year, month: 1, day: 1))
        else { return 0 }
        // `.weekday` is Sun=1..Sat=7. Remap to Mon=0..Sun=6.
        let weekday = cal.component(.weekday, from: jan1)
        return (weekday + 5) % 7
    }
}
