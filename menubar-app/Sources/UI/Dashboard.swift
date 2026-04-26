import SwiftUI
import Charts
import Core

public enum DashboardTab: String, CaseIterable, Identifiable {
    case overview, sessions, models, insights, budgets, repos, daily,
         rules, attribution, hooks

    public var id: String { rawValue }
    public var title: String {
        switch self {
        case .overview: return "Overview"
        case .sessions: return "Sessions"
        case .models: return "Models"
        case .insights: return "Insights"
        case .budgets: return "Budgets"
        case .repos: return "Repos"
        case .daily: return "Daily"
        case .rules: return "Rules"
        case .attribution: return "Attribution"
        case .hooks: return "Hooks"
        }
    }
    public var symbol: String {
        switch self {
        case .overview: return "house"
        case .sessions: return "list.bullet.rectangle"
        case .models: return "cube"
        case .insights: return "sparkles"
        case .budgets: return "dollarsign.circle"
        case .repos: return "folder"
        case .daily: return "calendar"
        case .rules: return "checklist"
        case .attribution: return "person.2"
        case .hooks: return "link"
        }
    }
    /// Signature color for each tab — drives sidebar icon, page-title gradient,
    /// and panel accents on that tab.
    public var color: Color {
        switch self {
        case .overview:    return Linear.accent
        case .sessions:    return Linear.info
        case .models:      return Linear.success
        case .insights:    return Linear.warn
        case .budgets:     return Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255)
        case .repos:       return Color(red: 0xb8/255, green: 0xa6/255, blue: 1.0)
        case .daily:       return Linear.info
        case .rules:       return Linear.accent
        case .attribution: return Linear.success
        case .hooks:       return Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255)
        }
    }
}

public enum AppTheme: String, CaseIterable {
    case system, light, dark
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
    var icon: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max.fill"
        case .dark:   return "moon.fill"
        }
    }
    var next: AppTheme {
        switch self { case .system: return .light; case .light: return .dark; case .dark: return .system }
    }
    var label: String {
        switch self { case .system: return "System"; case .light: return "Light"; case .dark: return "Dark" }
    }
}

public struct DashboardWindow: View {
    @Environment(AppStore.self) private var store
    @AppStorage("tokscale.dashboard.tab") private var selectionRaw: String = DashboardTab.overview.rawValue
    @AppStorage("tokscale.theme") private var themeRaw: String = AppTheme.system.rawValue
    @AppStorage("tokscale.sidebar.collapsed") private var sidebarCollapsed: Bool = false
    @State private var range: String = "30D"

    public init() {}
    private var theme: AppTheme { AppTheme(rawValue: themeRaw) ?? .system }

    private var selection: DashboardTab {
        get { DashboardTab(rawValue: selectionRaw) ?? .overview }
    }
    private func setSelection(_ t: DashboardTab) { selectionRaw = t.rawValue }

    public var body: some View {
        HStack(spacing: 0) {
            Sidebar(
                selection: selection,
                onSelect: setSelection,
                collapsed: sidebarCollapsed,
                onToggleCollapsed: {
                    withAnimation(.easeInOut(duration: 0.18)) {
                        sidebarCollapsed.toggle()
                    }
                }
            )
            .frame(width: sidebarCollapsed ? 56 : 228)
            .background(Linear.bg0)
            .overlay(alignment: .trailing) {
                Rectangle().fill(Linear.border).frame(width: 0.5)
            }

            VStack(spacing: 0) {
                Toolbar(
                    title: selection.title,
                    showRange: selection == .overview,
                    range: $range,
                    theme: theme,
                    onCycleTheme: { themeRaw = theme.next.rawValue }
                )
                .frame(height: 44)
                .background(Linear.bg0.opacity(0.6))
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Linear.border).frame(height: 0.5)
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        PageHead(tab: selection)
                        tabContent(selection)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, 40)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(Linear.bg0)
            }
            .background(Linear.bg0)
        }
        .preferredColorScheme(theme.colorScheme)
    }

    @ViewBuilder
    private func tabContent(_ tab: DashboardTab) -> some View {
        switch tab {
        case .overview:    OverviewTab(range: range)
        case .sessions:    SessionsTab()
        case .models:      ModelsTab()
        case .insights:    InsightsTab()
        case .budgets:     BudgetTab()
        case .repos:       ReposTab()
        case .daily:       DailyTab()
        case .rules:       RulesTab()
        case .attribution: AttributionTab()
        case .hooks:       HooksTab()
        }
    }
}

// MARK: - Sidebar

private struct Sidebar: View {
    @Environment(AppStore.self) private var store
    let selection: DashboardTab
    let onSelect: (DashboardTab) -> Void
    let collapsed: Bool
    let onToggleCollapsed: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Brand + collapse toggle
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(LinearGradient(
                        colors: [Color(red: 1.00, green: 0.85, blue: 0.35),
                                 Color(red: 0.93, green: 0.70, blue: 0.15)],
                        startPoint: .top, endPoint: .bottom))
                    .overlay(
                        Image(systemName: "cube.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(Color.black.opacity(0.75))
                    )
                    .frame(width: 22, height: 22)
                    .shadow(color: Color(red: 1.00, green: 0.80, blue: 0.25).opacity(0.35),
                            radius: 5, y: 2)
                if !collapsed {
                    Text("Toktracker")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Linear.ink0)
                    Spacer()
                    Button(action: onToggleCollapsed) {
                        Image(systemName: "sidebar.left")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Linear.ink3)
                            .padding(4)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help("Collapse sidebar")
                }
            }
            .padding(.horizontal, collapsed ? 0 : 8)
            .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
            .padding(.top, 6).padding(.bottom, 14)

            if collapsed {
                // Expand button
                Button(action: onToggleCollapsed) {
                    Image(systemName: "sidebar.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Linear.ink2)
                        .frame(width: 36, height: 28)
                        .background(Linear.panel)
                        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 14)
                .help("Expand sidebar")
            } else {
                // Search
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").font(.system(size: 11))
                    Text("Search…").font(.system(size: 12.5))
                    Spacer()
                    Text("⌘K")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(Linear.ink3)
                        .padding(.horizontal, 5).padding(.vertical, 1)
                        .background(Color.white.opacity(0.04))
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Linear.border, lineWidth: 0.5))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
                .foregroundStyle(Linear.ink2)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(Linear.panel)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Linear.border, lineWidth: 0.5))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 4).padding(.bottom, 14)

                sidebarGroup("Workspace")
            }

            ForEach(DashboardTab.allCases) { tab in
                SidebarItem(
                    tab: tab,
                    active: tab == selection,
                    count: count(for: tab),
                    collapsed: collapsed,
                    action: { onSelect(tab) }
                )
            }

            Spacer(minLength: 0)

            // Footer
            HStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(LinearGradient(
                            colors: [Linear.info, Color(red: 1.0, green: 0x9e/255, blue: 0xc7/255)],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 22, height: 22)
                    Text(userInitials)
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(Linear.bg0)
                }
                if !collapsed {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("You")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(Linear.ink1)
                        Text("Local workspace")
                            .font(.system(size: 10))
                            .foregroundStyle(Linear.ink3)
                    }
                    Spacer()
                    Image(systemName: "ellipsis")
                        .font(.system(size: 10))
                        .foregroundStyle(Linear.ink3)
                }
            }
            .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
            .padding(.horizontal, collapsed ? 0 : 10).padding(.vertical, 8)
            .overlay(alignment: .top) {
                Rectangle().fill(Linear.border).frame(height: 0.5)
            }
        }
        .padding(.horizontal, collapsed ? 6 : 10).padding(.vertical, 12)
    }

    private var userInitials: String { "T" }

    private func sidebarGroup(_ label: String) -> some View {
        Text(label.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.4)
            .foregroundStyle(Linear.ink3)
            .padding(.horizontal, 10).padding(.top, 10).padding(.bottom, 4)
    }

    @MainActor
    private func count(for tab: DashboardTab) -> String? {
        let agg = store.aggregates
        switch tab {
        case .sessions: return "\(agg.recentSessions.count)"
        case .models:   return "\(agg.models.count)"
        case .insights: return store.detections.isEmpty ? nil : "\(store.detections.count)"
        case .budgets:  return store.budgets.isEmpty ? nil : "\(store.budgets.count)"
        case .repos:    return agg.repos.isEmpty ? nil : "\(agg.repos.count)"
        default: return nil
        }
    }
}

private struct SidebarItem: View {
    let tab: DashboardTab
    let active: Bool
    let count: String?
    let collapsed: Bool
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: tab.symbol)
                    .font(.system(size: 12))
                    .frame(width: 14, height: 14)
                    .foregroundStyle(tab.color)
                if !collapsed {
                    Text(tab.title)
                        .font(.system(size: 12.5, weight: .medium))
                    Spacer()
                    if let count {
                        Text(count)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .foregroundStyle(active ? tab.color : Linear.ink3)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(active ? tab.color.opacity(0.15) : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
            }
            .foregroundStyle(active ? Linear.ink0 : Linear.ink1)
            .frame(maxWidth: .infinity, alignment: collapsed ? .center : .leading)
            .padding(.horizontal, collapsed ? 0 : 10).padding(.vertical, collapsed ? 8 : 6)
            .background(active ? tab.color.opacity(0.15)
                               : (hover ? Color.white.opacity(0.03) : Color.clear))
            .overlay(alignment: .leading) {
                if active && !collapsed {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(tab.color)
                        .frame(width: 2)
                        .padding(.vertical, 6)
                        .offset(x: -10)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(collapsed ? tab.title : "")
        .onHover { hover = $0 }
    }
}

// MARK: - Toolbar

private struct Toolbar: View {
    let title: String
    let showRange: Bool
    @Binding var range: String
    let theme: AppTheme
    let onCycleTheme: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Text("Local").foregroundStyle(Linear.ink2)
                Text("›").foregroundStyle(Linear.ink4)
                Text(title).foregroundStyle(Linear.ink0)
                    .fontWeight(.medium)
            }
            .font(.system(size: 13))
            Spacer()
            if showRange {
                RangeSegmented(
                    selection: $range,
                    options: ["24H", "7D", "30D", "90D"])
            }
            ThemeButton(theme: theme, onTap: onCycleTheme)
        }
        .padding(.horizontal, 20)
    }
}

private struct ThemeButton: View {
    let theme: AppTheme
    let onTap: () -> Void
    @State private var hover = false
    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 6) {
                Image(systemName: theme.icon)
                    .font(.system(size: 11, weight: .medium))
                Text(theme.label)
                    .font(.system(size: 11.5, weight: .medium))
            }
            .padding(.horizontal, 10)
            .frame(height: 28)
            .foregroundStyle(Linear.ink1)
            .background(hover ? Linear.panel2 : Linear.panel)
            .overlay(RoundedRectangle(cornerRadius: 7)
                .stroke(Linear.border, lineWidth: 0.5))
            .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
        .help("Theme: \(theme.label) (click to cycle)")
        .onHover { hover = $0 }
    }
}

// MARK: - Page head

private struct PageHead: View {
    @Environment(AppStore.self) private var store
    let tab: DashboardTab

    var body: some View {
        HStack(alignment: .bottom) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(tab.color.opacity(0.18))
                        .frame(width: 32, height: 32)
                    Image(systemName: tab.symbol)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(tab.color)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(tab.title)
                        .font(.system(size: 22, weight: .semibold))
                        .tracking(-0.4)
                        .foregroundStyle(LinearGradient(
                            colors: [Linear.ink0, tab.color],
                            startPoint: .leading, endPoint: .trailing))
                    Text(subtitle)
                        .font(.system(size: 12.5))
                        .foregroundStyle(Linear.ink2)
                }
            }
            Spacer()
        }
    }

    private var subtitle: String {
        switch tab {
        case .overview:
            let df = DateFormatter(); df.dateFormat = "MMM d, yyyy"
            return "Today · \(df.string(from: Date()))"
        case .sessions: return "All sessions · click a row to expand"
        case .models: return "Per-model usage, cost, and performance"
        case .insights: return "Detections sorted by severity"
        case .budgets: return "Limits, alerts, and burn rate"
        case .repos: return "Per-repo spend"
        case .daily: return "30-day trend"
        case .rules: return "Detection rules · thresholds"
        case .attribution: return "PR → session attribution"
        case .hooks: return "Claude Code hook install"
        }
    }
}
