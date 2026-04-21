import SwiftUI
import Charts
import Core

public struct ModelDetailSheet: View {
    let model: String
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    public init(model: String) { self.model = model }

    public var body: some View {
        let stats = store.aggregates.models.first { $0.model == model }
        let trend = store.aggregates.modelTrends[model] ?? []
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(model).font(.title2.monospaced())
                Spacer()
                Button("Close") { dismiss() }
            }
            if let stats {
                HStack(spacing: 12) {
                    StatCard(label: "Sessions", value: "\(stats.sessionCount)")
                    StatCard(label: "Input", value: Formatters.tokens(stats.inputTokens))
                    StatCard(label: "Output", value: Formatters.tokens(stats.outputTokens))
                    StatCard(label: "Cost", value: Formatters.cost(millicents: stats.costMillicents))
                }
            }
            Text("30-DAY TREND").font(.caption).foregroundStyle(.secondary)
            Chart(Array(trend.enumerated()), id: \.offset) { idx, cost in
                LineMark(
                    x: .value("Day", idx),
                    y: .value("Cost", Double(cost) / 100_000))
                .interpolationMethod(.monotone)
            }
            .frame(height: 180)
            Spacer()
        }
        .padding(24)
        .frame(width: 640, height: 440)
    }
}

public struct RepoDetailSheet: View {
    let repo: String
    @Environment(AppStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    public init(repo: String) { self.repo = repo }

    public var body: some View {
        let stats = store.aggregates.repos.first { $0.repo == repo }
        let sessions = store.aggregates.recentSessions.filter { $0.gitRepo == repo }
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(repo).font(.title2.monospaced())
                Spacer()
                Button("Close") { dismiss() }
            }
            if let stats {
                HStack(spacing: 12) {
                    StatCard(label: "Sessions", value: "\(stats.sessionCount)")
                    StatCard(label: "Models", value: "\(stats.models.count)")
                    StatCard(label: "Cost", value: Formatters.cost(millicents: stats.costMillicents))
                }
                Text(stats.models.joined(separator: ", "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Text("RECENT SESSIONS").font(.caption).foregroundStyle(.secondary)
            Table(Array(sessions.prefix(50))) {
                TableColumn("Started") { Text($0.startedAt.formatted(date: .numeric, time: .shortened)) }
                TableColumn("Model") { Text($0.primaryModel).monospaced().font(.caption) }
                TableColumn("Branch") { Text($0.gitBranch ?? "-").font(.caption) }
                TableColumn("Turns") { Text("\($0.turnCount)").font(.caption) }
                TableColumn("Cost") { Text(Formatters.cost(millicents: $0.costMillicents)) }
            }
            .frame(minHeight: 200)
        }
        .padding(24)
        .frame(width: 760, height: 520)
    }
}
