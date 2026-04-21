import SwiftUI
import Core
import AppKit

public struct MenuBarLabel: View {
    @Environment(AppStore.self) private var store
    public init() {}
    public var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "chart.line.uptrend.xyaxis")
            Text(Formatters.cost(millicents: store.aggregates.todayDetail.costMillicents))
                .monospacedDigit()
        }
        .task { await store.bootstrap() }
    }
}

// MARK: - Panel root

public struct MenuBarPanel: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openWindow) private var openWindow
    @State private var selectedTab: PanelTab = .today
    @AppStorage("panel.colorScheme") private var schemeRaw: String = "dark"

    private var scheme: ColorScheme {
        schemeRaw == "light" ? .light : .dark
    }

    public init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader()
            SegmentedTabs(selection: $selectedTab)
                .padding(.horizontal, 18)
                .padding(.top, 14)
                .padding(.bottom, 16)

            ScrollView(.vertical, showsIndicators: false) {
                Group {
                    switch selectedTab {
                    case .today:    TodayPane()
                    case .allTime:  AllTimePane()
                    case .insights: InsightsPane()
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 560)

            PanelBottomBar(
                scheme: scheme,
                toggleScheme: {
                    schemeRaw = (schemeRaw == "light") ? "dark" : "light"
                },
                onOpen: { openWindow(id: "dashboard") }
            )
            .padding(18)
        }
        .frame(width: 540)
        .environment(\.colorScheme, scheme)
        .background(Palette.panelBackground(scheme))
    }
}

/// Scheme-aware design tokens. Text + surface colors use `Color.primary`
/// with opacity so SwiftUI resolves them against the current `colorScheme`.
/// Accent/signal colors stay fixed across modes (brand hues).
enum Palette {
    static let text      = Color.primary
    static let textSoft  = Color.primary.opacity(0.62)
    static let textDim   = Color.primary.opacity(0.42)

    static let accent    = Color(red: 0.96, green: 0.75, blue: 0.18)
    static let accentHi  = Color(red: 1.00, green: 0.83, blue: 0.30)
    static let accentLow = Color(red: 0.72, green: 0.55, blue: 0.12)
    /// Deep amber — readable on light surfaces where bright yellow washes out.
    static let accentDeep = Color(red: 0.75, green: 0.45, blue: 0.05)
    static let accentDeepHi = Color(red: 0.88, green: 0.55, blue: 0.08)

    static let future    = Color.primary.opacity(0.10)
    static let surface   = Color.primary.opacity(0.07)
    static let stroke    = Color.primary.opacity(0.10)

    static let live      = Color(red: 0.12, green: 0.68, blue: 0.36)
    static let warn      = Color(red: 0.92, green: 0.55, blue: 0.10)
    static let danger    = Color(red: 0.86, green: 0.26, blue: 0.26)

    static func panelBackground(_ scheme: ColorScheme) -> LinearGradient {
        if scheme == .dark {
            return LinearGradient(
                colors: [
                    Color(red: 0.12, green: 0.10, blue: 0.06),
                    Color(red: 0.07, green: 0.07, blue: 0.08),
                    Color(red: 0.07, green: 0.07, blue: 0.08),
                ],
                startPoint: .top, endPoint: .bottom)
        } else {
            return LinearGradient(
                colors: [
                    Color(red: 1.00, green: 0.98, blue: 0.92),
                    Color(red: 0.97, green: 0.97, blue: 0.97),
                ],
                startPoint: .top, endPoint: .bottom)
        }
    }
}

enum PanelTab: String, CaseIterable {
    case today = "Today"
    case allTime = "All-time"
    case insights = "Insights"
}

// MARK: - Header

struct PanelHeader: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            AppGlyph()
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Tokscale")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(Palette.text)
                    LivePill()
                }
                Text("Today · \(store.aggregates.todayDetail.sessionCount) sessions")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.textSoft)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 4) {
                AnimatedCost(target: store.aggregates.todayDetail.costMillicents)
                DeltaPill()
            }
        }
        .padding(.top, 18)
        .padding(.horizontal, 18)
    }
}

struct AppGlyph: View {
    var body: some View {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(LinearGradient(
                colors: [Color(red: 1.00, green: 0.85, blue: 0.35),
                         Color(red: 0.93, green: 0.70, blue: 0.15)],
                startPoint: .top, endPoint: .bottom))
            .overlay(
                Image(systemName: "cube.fill")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(Color.black.opacity(0.75))
            )
            .frame(width: 44, height: 44)
            .shadow(color: Color(red: 1.00, green: 0.80, blue: 0.25).opacity(0.45), radius: 10, y: 4)
    }
}

struct LivePill: View {
    @State private var pulse = false
    var body: some View {
        HStack(spacing: 5) {
            Circle()
                .fill(Palette.live)
                .frame(width: 6, height: 6)
                .overlay(
                    Circle()
                        .stroke(Palette.live.opacity(0.5), lineWidth: 2)
                        .scaleEffect(pulse ? 2.2 : 1)
                        .opacity(pulse ? 0 : 0.6)
                )
            Text("LIVE")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(Palette.live)
        }
        .padding(.horizontal, 8).padding(.vertical, 3)
        .background(Capsule().fill(Palette.live.opacity(0.18)))
        .onAppear {
            withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
                pulse = true
            }
        }
    }
}

struct DeltaPill: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        if let pct = deltaPct() {
            HStack(spacing: 4) {
                Image(systemName: "triangle.fill")
                    .rotationEffect(.degrees(pct >= 0 ? 0 : 180))
                    .font(.system(size: 8))
                    .foregroundStyle(pct >= 0 ? Palette.live : Palette.danger)
                Text("\(pct >= 0 ? "+" : "")\(pct)%")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(pct >= 0 ? Palette.live : Palette.danger)
                Text("vs yesterday")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Palette.textSoft)
            }
        } else {
            Text(" ")
                .font(.system(size: 12))
                .foregroundStyle(Palette.textSoft)
        }
    }

    private func deltaPct() -> Int? {
        let daily = store.aggregates.dailyStats
        guard daily.count >= 2 else { return nil }
        let today = daily.last?.costMillicents ?? 0
        let yesterday = daily[daily.count - 2].costMillicents
        guard yesterday > 0 else { return today > 0 ? 100 : nil }
        let d = Double(today - yesterday) / Double(yesterday) * 100
        return Int(d.rounded())
    }
}

// MARK: - Animated cost

struct AnimatedCost: View {
    let target: Int // millicents
    @State private var started = Date()
    @State private var endTarget: Int = 0

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { ctx in
            let elapsed = ctx.date.timeIntervalSince(started)
            let t = min(1, elapsed / 0.9)
            let eased = 1 - pow(1 - t, 3)
            let v = Double(endTarget) * eased
            CostDisplay(millicents: Int(v))
        }
        .onAppear {
            started = Date()
            endTarget = target
        }
        .onChange(of: target) { _, new in
            started = Date()
            endTarget = new
        }
    }
}

struct CostDisplay: View {
    let millicents: Int

    var body: some View {
        let dollars = Double(millicents) / 100_000
        let whole = Int(dollars)
        let cents = Int((dollars - Double(whole)) * 100)
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("$\(whole)")
                .font(.system(size: 34, weight: .semibold, design: .monospaced))
                .foregroundStyle(Palette.text)
            Text(String(format: ".%02d", cents))
                .font(.system(size: 22, weight: .medium, design: .monospaced))
                .foregroundStyle(Palette.textSoft)
        }
        .monospacedDigit()
    }
}

// MARK: - Segmented tabs

struct SegmentedTabs: View {
    @Binding var selection: PanelTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(PanelTab.allCases, id: \.self) { tab in
                Button {
                    withAnimation(.easeInOut(duration: 0.22)) {
                        selection = tab
                    }
                } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 14, weight: selection == tab ? .semibold : .regular))
                        .foregroundStyle(selection == tab ? Palette.text : Palette.textSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            Group {
                                if selection == tab {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .fill(Color.white.opacity(0.14))
                                        .matchedGeometryEffect(id: "tab", in: ns)
                                }
                            }
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.05))
        )
    }

    @Namespace private var ns
}

// MARK: - Panes

struct TodayPane: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let t = store.aggregates.todayDetail
        VStack(spacing: 20) {
            UsageSection()
            TokensBreakdownSection(
                title: "TOKENS · TODAY",
                input: t.inputTokens,
                output: t.outputTokens,
                cacheRead: t.cacheReadTokens,
                cacheWrite: t.cacheWriteTokens
            )
            TopModelsSection()
            InsightsSummarySection()
        }
    }
}

struct UsageSection: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel("USAGE · LAST 24H")
                Spacer()
                Text(Formatters.tokens(
                    store.aggregates.todayDetail.inputTokens + store.aggregates.todayDetail.outputTokens
                ) + " tokens")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Palette.textSoft)
            }
            HourlyBars(hourly: store.aggregates.todayDetail.hourly)
                .frame(height: 100)
        }
    }
}

struct HourlyBars: View {
    let hourly: [Int]
    var loopDuration: Double = 3.0
    @Environment(\.colorScheme) private var scheme
    @State private var started = Date()
    @State private var entered = false
    @State private var done = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            TimelineView(.animation(minimumInterval: 1.0 / 60, paused: done)) { ctx in
                let elapsed = ctx.date.timeIntervalSince(started)
                let progress = min(1.0, elapsed / loopDuration)
                // first 0.6s: bars rise in from 0 to full — gates on `entered`
                let entrance = entered ? 1.0 : 0.0

                Canvas { context, size in
                    drawBars(in: context, size: size, progress: progress, entrance: entrance)
                }
                .animation(.easeOut(duration: 0.6), value: entered)
            }
            .frame(maxHeight: .infinity)
            .task(id: hourly) {
                started = Date()
                done = false
                try? await Task.sleep(nanoseconds: UInt64((loopDuration + 0.1) * 1_000_000_000))
                done = true
            }

            HStack {
                Text("12a")
                Spacer()
                Text("6a")
                Spacer()
                Text("12p")
                Spacer()
                Text("6p")
                Spacer()
                Text("now")
            }
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(Palette.textDim)
        }
        .onAppear {
            started = Date()
            entered = true
        }
    }

    private func drawBars(
        in context: GraphicsContext,
        size: CGSize,
        progress: Double,
        entrance: Double
    ) {
        let peak = CGFloat(max(1, hourly.max() ?? 1))
        let currentHour = Calendar.current.component(.hour, from: Date())
        let gap: CGFloat = 4
        let barWidth = (size.width - gap * CGFloat(hourly.count - 1)) / CGFloat(hourly.count)
        let radius: CGFloat = 2.5

        // --- Base bars ---
        struct Bar { let rect: CGRect; let value: Int; let hour: Int }
        var bars: [Bar] = []
        for (hour, value) in hourly.enumerated() {
            let x = CGFloat(hour) * (barWidth + gap)
            let normalized = CGFloat(value) / peak
            let full = max(3, normalized * (size.height - 2))
            let h = max(3, full * CGFloat(entrance))
            let y = size.height - h
            bars.append(.init(rect: CGRect(x: x, y: y, width: barWidth, height: h),
                              value: value, hour: hour))
        }
        for b in bars {
            context.fill(
                Path(roundedRect: b.rect, cornerRadius: radius),
                with: .color(barBaseColor(hour: b.hour, current: currentHour, value: b.value)))
        }

        // --- Top-edge path that traces the silhouette of the bars ---
        // Left-up → across the top of bar 0 → drop/rise to top of bar 1 in the gap → across → …
        // Traverses all 24 bars so the comet travels the full x-axis width
        // from "12a" to "now", sweeping over the dim future-hour stubs.
        let maxHour = hourly.count - 1
        guard maxHour >= 0 else { return }
        _ = currentHour  // silence unused warning; currentHour only sizes bar colors now

        var edge = Path()
        let first = bars[0]
        edge.move(to: CGPoint(x: first.rect.minX, y: first.rect.minY))
        edge.addLine(to: CGPoint(x: first.rect.maxX, y: first.rect.minY))
        for i in 1...maxHour {
            let curr = bars[i]
            // Diagonal bridge across the gap from previous top-right to current top-left
            edge.addLine(to: CGPoint(x: curr.rect.minX, y: curr.rect.minY))
            // Flat across the current bar's top
            edge.addLine(to: CGPoint(x: curr.rect.maxX, y: curr.rect.minY))
        }

        // --- Comet trail along the edge ---
        let tail = 0.22
        let head = progress
        let start = max(0, head - tail)
        let trimmed = edge.trimmedPath(from: start, to: head)

        let dark = scheme == .dark
        // Light mode keeps the same warm hue but at much lower opacity so the
        // trail reads as a soft glow rather than a solid amber stripe.
        let glowColor = dark ? Palette.accentHi : Palette.accent
        let coreColor = dark ? Palette.accentHi : Palette.accentDeepHi.opacity(0.75)
        let sparkHalo = dark ? Palette.accentHi : Palette.accent
        let sparkCore = dark ? Color.white.opacity(0.95) : Palette.accentDeep.opacity(0.85)
        let blend: GraphicsContext.BlendMode = dark ? .plusLighter : .normal
        let glowAlpha: Double = dark ? 0.9 : 0.45
        let sparkAlpha: Double = dark ? 1.0 : 0.55
        let glowWidth: CGFloat = dark ? 5 : 3.5

        var glow = context
        glow.blendMode = blend
        glow.addFilter(.blur(radius: dark ? 6 : 5))
        glow.stroke(
            trimmed,
            with: .color(glowColor.opacity(glowAlpha)),
            style: StrokeStyle(lineWidth: glowWidth, lineCap: .round, lineJoin: .round))

        // Crisp hot core right behind the head
        let coreStart = max(0, head - tail * 0.35)
        let coreSegment = edge.trimmedPath(from: coreStart, to: head)
        context.stroke(
            coreSegment,
            with: .color(coreColor),
            style: StrokeStyle(lineWidth: dark ? 2 : 1.6, lineCap: .round, lineJoin: .round))

        // --- Spark point at the head ---
        if let headPt = pointOnPath(edge, at: head) {
            var spark = context
            spark.blendMode = blend
            spark.addFilter(.blur(radius: 3))
            spark.fill(
                Path(ellipseIn: CGRect(x: headPt.x - 5, y: headPt.y - 5, width: 10, height: 10)),
                with: .color(sparkHalo.opacity(sparkAlpha)))
            context.fill(
                Path(ellipseIn: CGRect(x: headPt.x - 2, y: headPt.y - 2, width: 4, height: 4)),
                with: .color(sparkCore))
        }
    }

    private func pointOnPath(_ path: Path, at t: Double) -> CGPoint? {
        let slice = path.trimmedPath(
            from: max(0, t - 0.0015),
            to: min(1, t + 0.0015))
        let box = slice.boundingRect
        guard box.width.isFinite, box.height.isFinite else { return nil }
        return CGPoint(x: box.midX, y: box.midY)
    }

    private func barBaseColor(hour: Int, current: Int, value: Int) -> Color {
        if hour > current { return Palette.future }
        if value == 0    { return Palette.accentLow }
        return Palette.accentHi
    }
}

struct TopModelsSection: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let models = store.aggregates.todayDetail.models
        let total = max(1, models.reduce(0) { $0 + $1.costMillicents })
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel("TOP MODELS · TODAY")
                Spacer()
                Text("\(models.count) active")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Palette.textSoft)
            }
            if models.isEmpty {
                Text("No activity yet today")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.textSoft)
                    .padding(.vertical, 8)
            } else {
                ForEach(models.prefix(3)) { m in
                    ModelRow(
                        model: m.model,
                        cost: m.costMillicents,
                        pct: Int((Double(m.costMillicents) / Double(total) * 100).rounded()))
                }
            }
        }
    }
}

struct ModelRow: View {
    let model: String
    let cost: Int
    let pct: Int

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(modelColor(model))
                .frame(width: 10, height: 10)
            Text(model)
                .font(.system(size: 13, design: .monospaced))
                .foregroundStyle(Palette.text)
            Spacer()
            Text("\(pct)%")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(Palette.textSoft)
            Text(Formatters.cost(millicents: cost))
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundStyle(Palette.text)
        }
    }

    private func modelColor(_ m: String) -> Color {
        let lower = m.lowercased()
        if lower.contains("opus")   { return Palette.accent }
        if lower.contains("sonnet") { return Color(red: 1.00, green: 0.66, blue: 0.29) }
        if lower.contains("haiku")  { return Color(red: 1.00, green: 0.89, blue: 0.42) }
        if lower.contains("gpt")    { return Color(red: 0.20, green: 0.86, blue: 0.50) }
        if lower.contains("gemini") { return Color(red: 1.00, green: 0.56, blue: 0.74) }
        return Color.gray
    }
}

struct InsightsSummarySection: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        let items = Array(store.detections.prefix(3))
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel("INSIGHTS")
                Spacer()
                Text("\(store.detections.count) new")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Palette.textSoft)
            }
            if items.isEmpty {
                Text("No insights yet")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.textSoft)
                    .padding(.vertical, 8)
            } else {
                ForEach(items) { det in
                    InsightRow(detection: det)
                }
            }
        }
    }
}

struct InsightRow: View {
    let detection: Detection

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            InsightIcon(severity: detection.severity)
            Text(detection.summary)
                .font(.system(size: 13))
                .foregroundStyle(Palette.text)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }
}

struct InsightIcon: View {
    let severity: Severity

    var body: some View {
        RoundedRectangle(cornerRadius: 5, style: .continuous)
            .fill(background)
            .overlay(
                Image(systemName: glyph)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(foreground)
            )
            .frame(width: 20, height: 20)
    }

    private var background: Color {
        switch severity {
        case .info: return Palette.accent.opacity(0.28)
        case .warn: return Palette.warn.opacity(0.28)
        case .block: return Palette.danger.opacity(0.28)
        }
    }
    private var foreground: Color {
        switch severity {
        case .info: return Palette.accentHi
        case .warn: return Palette.warn
        case .block: return Palette.danger
        }
    }
    private var glyph: String {
        switch severity {
        case .info: return "circle.fill"
        case .warn: return "exclamationmark"
        case .block: return "minus"
        }
    }
}

// All-time pane

struct AllTimePane: View {
    @Environment(AppStore.self) private var store
    @AppStorage("menubar.activity.range") private var rangeRaw: String = "ALL"
    var body: some View {
        let a = store.aggregates.allTime
        let daily = store.aggregates.dailyStats.map { $0.costMillicents }
        VStack(spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                SectionLabel("ALL-TIME SPEND")
                HStack(spacing: 10) {
                    MetricCard(label: "Cost", value: Formatters.cost(millicents: a.costMillicents))
                    MetricCard(label: "Sessions", value: "\(a.sessionCount)")
                    MetricCard(label: "Models", value: "\(a.uniqueModels)")
                    MetricCard(label: "Cache reuse", value: String(format: "%.0f%%", a.cacheReuseRatio * 100))
                }
            }

            MenubarActivitySection(rangeRaw: $rangeRaw)

            TokensBreakdownSection(
                title: "TOKENS · ALL-TIME",
                input: a.inputTokens,
                output: a.outputTokens,
                cacheRead: a.cacheReadTokens,
                cacheWrite: a.cacheWriteTokens
            )

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SectionLabel("30-DAY TREND")
                    Spacer()
                    Text("\(daily.filter { $0 > 0 }.count) active days")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Palette.textSoft)
                }
                GlowingSpendChart(values: daily)
                    .padding(.horizontal, 2)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Palette.surface))
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    SectionLabel("TOP MODELS · ALL-TIME")
                    Spacer()
                    Text("\(store.aggregates.models.count) total")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(Palette.textSoft)
                }
                let total = max(1, store.aggregates.models.reduce(0) { $0 + $1.costMillicents })
                ForEach(store.aggregates.models.prefix(5)) { m in
                    ModelRow(model: m.model, cost: m.costMillicents,
                             pct: Int((Double(m.costMillicents) / Double(total) * 100).rounded()))
                }
            }
        }
    }
}

/// Compact token breakdown used in menubar panes. Shows a TOTAL row plus
/// input/output/cache-read/cache-write split in a 2x2 grid.
struct TokensBreakdownSection: View {
    let title: String
    let input: Int
    let output: Int
    let cacheRead: Int
    let cacheWrite: Int

    private var total: Int { input + output + cacheRead + cacheWrite }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel(title)
                Spacer()
                Text(Formatters.tokens(total) + " total")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(Palette.textSoft)
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4),
                      spacing: 10) {
                TokenMiniCard(label: "Input", value: input)
                TokenMiniCard(label: "Output", value: output)
                TokenMiniCard(label: "Cache read", value: cacheRead)
                TokenMiniCard(label: "Cache write", value: cacheWrite)
            }
        }
    }
}

private struct TokenMiniCard: View {
    let label: String
    let value: Int
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Palette.textSoft)
            Spacer()
            Text(Formatters.tokens(value))
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundStyle(Palette.text)
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.05)))
    }
}

/// Compact activity card for the menu-bar popover. Shows the same hero stats
/// and heatmap as the dashboard tab, sized to fit a 420px wide popover.
struct MenubarActivitySection: View {
    @Environment(AppStore.self) private var store
    @Binding var rangeRaw: String

    var body: some View {
        let range = OverviewRange.from(rangeRaw == "ALL" ? "" : rangeRaw)
        let stats = ActivityStatsCalculator.compute(
            db: store.db,
            dailyStats: store.aggregates.dailyStats,
            models: store.aggregates.models,
            range: range)
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                SectionLabel("ACTIVITY")
                Spacer()
                HStack(spacing: 4) {
                    ForEach(["ALL", "30D", "7D"], id: \.self) { opt in
                        let active = rangeRaw == opt
                        Button { rangeRaw = opt } label: {
                            Text(opt)
                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                                .foregroundStyle(active ? Palette.text : Palette.textSoft)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(active ? Palette.surface : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4),
                      spacing: 8) {
                MiniHero(label: "Sessions",   value: "\(stats.sessions)")
                MiniHero(label: "Tokens",     value: Formatters.tokens(stats.totalTokens))
                MiniHero(label: "Streak",     value: "\(stats.currentStreak)d · \(stats.longestStreak)d")
                MiniHero(label: "Peak hour",  value: formatHour(stats.peakHour))
            }
            CompactHeatmap(cells: stats.yearCells)
                .frame(height: 56)
            if stats.totalTokens > 0 {
                Text(mobyDickFact(tokens: stats.totalTokens))
                    .font(.system(size: 10.5))
                    .foregroundStyle(Palette.textSoft)
            }
        }
    }

    private func formatHour(_ h: Int?) -> String {
        guard let h else { return "—" }
        if h == 0 { return "12 AM" }
        if h == 12 { return "12 PM" }
        return h < 12 ? "\(h) AM" : "\(h - 12) PM"
    }

    private func mobyDickFact(tokens: Int) -> String {
        let mobyDick = 210_000
        let ratio = Double(tokens) / Double(mobyDick)
        if ratio < 1 {
            return "≈ \(Int(ratio * 100))% of Moby-Dick."
        }
        return "≈ \(Formatters.tokens(Int(ratio)))× Moby-Dick."
    }
}

private struct MiniHero: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .tracking(0.6)
                .foregroundStyle(Palette.textSoft)
            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(Palette.text)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 8).padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Palette.surface))
    }
}

private struct CompactHeatmap: View {
    let cells: [YearCell]
    var body: some View {
        let grid = YearGridLayout(cells: cells)
        GeometryReader { geo in
            let spacing: CGFloat = 2
            let cellW = (geo.size.width - spacing * CGFloat(grid.cols - 1)) / CGFloat(grid.cols)
            let cellH = (geo.size.height - spacing * CGFloat(grid.rows - 1)) / CGFloat(grid.rows)
            let cell = min(cellW, cellH)
            let peak = max(1, cells.map { $0.value }.max() ?? 1)
            VStack(alignment: .leading, spacing: spacing) {
                ForEach(0..<grid.rows, id: \.self) { r in
                    HStack(spacing: spacing) {
                        ForEach(0..<grid.cols, id: \.self) { c in
                            let cellData = grid.at(row: r, col: c)
                            RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                                .fill(color(cell: cellData, peak: peak))
                                .frame(width: cell, height: cell)
                        }
                    }
                }
            }
        }
    }

    private func color(cell: YearCell?, peak: Int) -> Color {
        guard let cell else { return Palette.surface.opacity(0.4) }
        if cell.isFuture { return Palette.surface.opacity(0.6) }
        if cell.value == 0 { return Palette.surface }
        let ratio = Double(cell.value) / Double(peak)
        let alpha: Double
        switch ratio {
        case ..<0.25:  alpha = 0.35
        case ..<0.5:   alpha = 0.55
        case ..<0.75:  alpha = 0.75
        default:       alpha = 1.00
        }
        return Palette.accent.opacity(alpha)
    }
}

struct MetricCard: View {
    let label: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Palette.textSoft)
            Text(value)
                .font(.system(size: 18, weight: .semibold, design: .monospaced))
                .foregroundStyle(Palette.text)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.05))
        )
    }
}

struct InsightsPane: View {
    @Environment(AppStore.self) private var store
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("INSIGHTS")
            if store.detections.isEmpty {
                Text("No insights yet")
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.textSoft)
                    .padding(.vertical, 16)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(store.detections) { d in
                            InsightRow(detection: d)
                        }
                    }
                }
                .frame(maxHeight: 320)
            }
        }
    }
}

// MARK: - Shared

struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundStyle(Palette.textSoft)
            .kerning(0.8)
    }
}

// MARK: - Bottom bar

struct PanelBottomBar: View {
    let scheme: ColorScheme
    let toggleScheme: () -> Void
    let onOpen: () -> Void
    @State private var paused = false

    var body: some View {
        HStack(spacing: 10) {
            RoundIconButton(systemName: paused ? "play.fill" : "pause.fill") {
                paused.toggle()
            }
            Button(action: onOpen) {
                HStack(spacing: 6) {
                    Text("Open Dashboard")
                        .font(.system(size: 14, weight: .semibold))
                    Spacer(minLength: 2)
                    HStack(spacing: 2) {
                        Text("⌘").font(.system(size: 11, design: .monospaced))
                        Text("↵").font(.system(size: 11, design: .monospaced))
                    }
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 5)
                            .fill(Color.black.opacity(0.22))
                    )
                }
                .foregroundStyle(.black)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Palette.accent)
                )
            }
            .buttonStyle(.plain)
            .keyboardShortcut(.return, modifiers: .command)
            RoundIconButton(systemName: scheme == .dark ? "sun.max.fill" : "moon.fill") {
                toggleScheme()
            }
        }
    }
}

struct RoundIconButton: View {
    let systemName: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14))
                .foregroundStyle(Palette.text.opacity(0.85))
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Background

