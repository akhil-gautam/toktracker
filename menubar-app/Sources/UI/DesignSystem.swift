import SwiftUI
import AppKit

/// Resolves to different colors for light vs dark appearance.
private func dyn(_ light: Color, _ dark: Color) -> Color {
    Color(nsColor: NSColor(name: nil) { appearance in
        let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        return NSColor(isDark ? dark : light)
    })
}

private func rgb(_ r: Int, _ g: Int, _ b: Int) -> Color {
    Color(red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255)
}

/// Linear-flavored design tokens. Values adapt automatically to the current
/// color scheme; the Dashboard window picks between system/light/dark via the
/// theme picker.
public enum Linear {
    public static let bg0 = dyn(rgb(0xf6, 0xf6, 0xf8), rgb(0x08, 0x08, 0x0a))
    public static let bg1 = dyn(rgb(0xec, 0xed, 0xf0), rgb(0x0d, 0x0d, 0x10))
    public static let bg2 = dyn(rgb(0xe5, 0xe6, 0xea), rgb(0x11, 0x11, 0x14))
    public static let panel   = dyn(Color.white,                 rgb(0x16, 0x16, 0x1a))
    public static let panel2  = dyn(rgb(0xf4, 0xf4, 0xf6),       rgb(0x1a, 0x1a, 0x1f))
    public static let panelHi = dyn(rgb(0xea, 0xea, 0xee),       rgb(0x1e, 0x1e, 0x24))

    public static let border       = dyn(Color.black.opacity(0.08), Color.white.opacity(0.06))
    public static let borderStrong = dyn(Color.black.opacity(0.14), Color.white.opacity(0.10))
    public static let borderHi     = dyn(Color.black.opacity(0.20), Color.white.opacity(0.14))
    public static let divider      = dyn(Color.black.opacity(0.06), Color.white.opacity(0.05))

    public static let ink0 = dyn(rgb(0x0b, 0x0b, 0x10), rgb(0xf4, 0xf4, 0xf6))
    public static let ink1 = dyn(rgb(0x2a, 0x2a, 0x34), rgb(0xc8, 0xc8, 0xd0))
    public static let ink2 = dyn(rgb(0x5a, 0x5a, 0x66), rgb(0x8b, 0x8b, 0x96))
    public static let ink3 = dyn(rgb(0x8b, 0x8b, 0x96), rgb(0x5a, 0x5a, 0x66))
    public static let ink4 = dyn(rgb(0xb5, 0xb5, 0xc0), rgb(0x3a, 0x3a, 0x44))

    public static let accent       = dyn(rgb(0x6a, 0x70, 0xf0), rgb(0x8a, 0x8f, 0xff))
    public static let accentStrong = dyn(rgb(0x50, 0x55, 0xd0), rgb(0x6a, 0x70, 0xf0))
    public static let accentDim    = dyn(rgb(0x6a, 0x70, 0xf0).opacity(0.12),
                                          rgb(0x8a, 0x8f, 0xff).opacity(0.14))

    public static let success = dyn(rgb(0x2f, 0x9e, 0x6a), rgb(0x7c, 0xd6, 0xa6))
    public static let warn    = dyn(rgb(0xc9, 0x73, 0x1e), rgb(0xff, 0xb8, 0x6a))
    public static let danger  = dyn(rgb(0xd1, 0x3d, 0x55), rgb(0xff, 0x7a, 0x8a))
    public static let info    = dyn(rgb(0x2a, 0x95, 0xd1), rgb(0x7e, 0xd0, 0xff))

    /// Distinct color per model for swatches / stacked bars. Picks deterministically
    /// from a palette so the same model always gets the same color.
    public static func modelColor(_ model: String) -> Color {
        let palette: [Color] = [
            accent, info, success, warn, danger,
            dyn(rgb(0xd1, 0x5f, 0x95), rgb(0xff, 0x9e, 0xc7)),
            dyn(rgb(0x78, 0x60, 0xd0), rgb(0xb8, 0xa6, 0xff)),
            dyn(rgb(0x4a, 0xa6, 0x78), rgb(0x9d, 0xe0, 0xb9)),
        ]
        var h = 5381
        for b in model.utf8 { h = ((h << 5) &+ h) &+ Int(b) }
        return palette[abs(h) % palette.count]
    }
}

// MARK: - Panel

public struct Panel<Content: View>: View {
    var title: String?
    var subtitle: String?
    var trailing: AnyView?
    var padding: Bool = true
    var accent: Color? = nil
    let content: Content

    public init(
        title: String? = nil,
        subtitle: String? = nil,
        trailing: AnyView? = nil,
        padding: Bool = true,
        accent: Color? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.trailing = trailing
        self.padding = padding
        self.accent = accent
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if title != nil || trailing != nil {
                HStack(alignment: .center) {
                    if let title {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(title)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Linear.ink0)
                            if let subtitle {
                                Text(subtitle)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(Linear.ink3)
                            }
                        }
                    }
                    Spacer()
                    if let trailing { trailing }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 10)
                .overlay(alignment: .bottom) {
                    Rectangle().fill(Linear.divider).frame(height: 0.5)
                }
            }
            if padding {
                content.padding(16)
            } else {
                content
            }
        }
        .background(Linear.panel)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

// MARK: - KPI card

public struct KPICard: View {
    let label: String
    let value: String
    var cents: String? = nil
    var delta: Double? = nil
    var spark: [Double]? = nil
    var color: Color = Linear.accent

    public init(label: String, value: String, cents: String? = nil,
                delta: Double? = nil, spark: [Double]? = nil,
                color: Color = Linear.accent) {
        self.label = label; self.value = value; self.cents = cents
        self.delta = delta; self.spark = spark; self.color = color
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(label.uppercased())
                    .font(.system(size: 11, weight: .semibold))
                    .tracking(1.0)
                    .foregroundStyle(color.opacity(0.85))
            }
            .padding(.bottom, 10)

            HStack(alignment: .lastTextBaseline, spacing: 0) {
                Text(value)
                    .font(.system(size: 24, weight: .medium, design: .monospaced))
                    .foregroundStyle(color)
                if let cents {
                    Text(cents)
                        .font(.system(size: 18, weight: .medium, design: .monospaced))
                        .foregroundStyle(color.opacity(0.55))
                }
            }

            HStack(spacing: 8) {
                if let delta {
                    let down = delta < 0
                    HStack(spacing: 2) {
                        Image(systemName: down ? "arrowtriangle.down.fill" : "arrowtriangle.up.fill")
                            .font(.system(size: 8))
                        Text("\(Int(abs(delta) * 100))%")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                    }
                    .foregroundStyle(down ? Linear.danger : Linear.success)
                }
                Spacer()
                if let spark {
                    Sparkline(data: spark, color: color)
                        .frame(height: 18)
                }
            }
            .padding(.top, 12)
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Linear.panel)
        .overlay(Rectangle().stroke(Linear.border, lineWidth: 0.5))
    }
}

// MARK: - Chip / Swatch / LiveDot / FilterPill

public enum ChipKind { case accent, warn, danger, success, info, ghost }

public struct Chip: View {
    let text: String
    var kind: ChipKind = .accent
    var leadingDot: Bool = false
    public init(_ text: String, kind: ChipKind = .accent, leadingDot: Bool = false) {
        self.text = text; self.kind = kind; self.leadingDot = leadingDot
    }
    public var body: some View {
        let (fg, bg, border) = colors
        HStack(spacing: 4) {
            if leadingDot { LiveDot(color: fg) }
            Text(text)
                .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
        }
        .padding(.horizontal, 7).padding(.vertical, 2)
        .foregroundStyle(fg)
        .background(bg)
        .overlay(RoundedRectangle(cornerRadius: 5).stroke(border, lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 5))
    }
    private var colors: (Color, Color, Color) {
        switch kind {
        case .accent:  return (Linear.accent, Color(red:0x8a/255,green:0x8f/255,blue:1.0).opacity(0.12), Color(red:0x8a/255,green:0x8f/255,blue:1.0).opacity(0.22))
        case .warn:    return (Linear.warn, Linear.warn.opacity(0.12), Linear.warn.opacity(0.22))
        case .danger:  return (Linear.danger, Linear.danger.opacity(0.12), Linear.danger.opacity(0.22))
        case .success: return (Linear.success, Linear.success.opacity(0.12), Linear.success.opacity(0.22))
        case .info:    return (Linear.info, Linear.info.opacity(0.12), Linear.info.opacity(0.22))
        case .ghost:   return (Linear.ink2, Color.white.opacity(0.04), Linear.border)
        }
    }
}

public struct Swatch: View {
    let color: Color
    public init(_ color: Color) { self.color = color }
    public var body: some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(color)
            .frame(width: 8, height: 8)
    }
}

public struct LiveDot: View {
    var color: Color = Linear.success
    @State private var pulse = false
    public init(color: Color = Linear.success) { self.color = color }
    public var body: some View {
        Circle()
            .fill(color)
            .frame(width: 5, height: 5)
            .overlay(
                Circle()
                    .stroke(color.opacity(pulse ? 0 : 0.6), lineWidth: pulse ? 3 : 0)
                    .scaleEffect(pulse ? 2.2 : 1.0)
            )
            .onAppear {
                withAnimation(.easeOut(duration: 2).repeatForever(autoreverses: false)) {
                    pulse = true
                }
            }
    }
}

public struct FilterPill: View {
    let label: String
    let active: Bool
    var onTap: () -> Void = {}
    public init(_ label: String, active: Bool, onTap: @escaping () -> Void = {}) {
        self.label = label; self.active = active; self.onTap = onTap
    }
    public var body: some View {
        Button(action: onTap) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .padding(.horizontal, 10)
                .frame(height: 28)
                .foregroundStyle(active ? Linear.accent : Linear.ink1)
                .background(active ? Linear.accentDim : Linear.panel)
                .overlay(RoundedRectangle(cornerRadius: 7)
                    .stroke(active ? Linear.accent.opacity(0.3) : Linear.border,
                            lineWidth: 0.5))
                .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - LinearButton

public struct LinearButton: View {
    let label: String
    var icon: String? = nil
    var primary: Bool = false
    var ghost: Bool = false
    let action: () -> Void
    public init(_ label: String, icon: String? = nil, primary: Bool = false,
                ghost: Bool = false, action: @escaping () -> Void) {
        self.label = label; self.icon = icon; self.primary = primary
        self.ghost = ghost; self.action = action
    }
    public var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon).font(.system(size: 11)) }
                Text(label).font(.system(size: 12, weight: primary ? .semibold : .medium))
            }
            .padding(.horizontal, 10)
            .frame(height: 28)
            .foregroundStyle(primary ? Color.black
                                     : (ghost ? Linear.ink2 : Linear.ink1))
            .background(primary ? Palette.accent : (ghost ? Color.clear : Linear.panel))
            .overlay(RoundedRectangle(cornerRadius: 7)
                .stroke(primary || ghost ? Color.clear : Linear.border, lineWidth: 0.5))
            .clipShape(RoundedRectangle(cornerRadius: 7))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Range segmented control

public struct RangeSegmented: View {
    @Binding var selection: String
    let options: [String]
    public init(selection: Binding<String>, options: [String]) {
        self._selection = selection; self.options = options
    }
    public var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { opt in
                let active = opt == selection
                Button { selection = opt } label: {
                    Text(opt)
                        .font(.system(size: 11.5, weight: .medium, design: .monospaced))
                        .tracking(-0.2)
                        .foregroundStyle(active ? Linear.ink0 : Linear.ink2)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(active ? Linear.panelHi : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(Linear.panel)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Linear.border, lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Sparkline

public struct Sparkline: View {
    let data: [Double]
    var color: Color = Linear.accent
    public init(data: [Double], color: Color = Linear.accent) {
        self.data = data; self.color = color
    }
    public var body: some View {
        GeometryReader { geo in
            let size = geo.size
            ZStack {
                Path { p in sparkPath(&p, data: data, size: size) }
                    .stroke(color.opacity(0.35),
                            style: StrokeStyle(lineWidth: 1.2, lineCap: .round, lineJoin: .round))
                CometOverlay(data: data, color: color,
                             loopDuration: 2.8, tailLength: 0.25,
                             blurRadius: 3, coreWidth: 1.4, tailWidth: 3, showHead: false)
            }
        }
    }
}

private func sparkPath(_ p: inout Path, data: [Double], size: CGSize) {
    guard data.count > 1 else { return }
    let maxV = max(data.max() ?? 1, 0.0001)
    let step = size.width / CGFloat(data.count - 1)
    for (i, v) in data.enumerated() {
        let x = step * CGFloat(i)
        let y = size.height - (CGFloat(v) / CGFloat(maxV)) * size.height
        if i == 0 { p.move(to: CGPoint(x: x, y: y)) } else { p.addLine(to: CGPoint(x: x, y: y)) }
    }
}

/// Reusable comet trail that rides along a line path shared with the host view.
/// The caller provides the same sampled data used to draw the underlying line;
/// this overlay trims a fading segment around the animated progress and blurs
/// it to look like a moving flame.
public struct CometOverlay: View {
    let data: [Double]
    var color: Color = Linear.accent
    var loopDuration: Double = 3.0
    var tailLength: Double = 0.22
    var blurRadius: CGFloat = 6
    var coreWidth: CGFloat = 2.0
    var tailWidth: CGFloat = 4.5
    var showHead: Bool = true
    var padY: CGFloat = 0

    @Environment(\.colorScheme) private var scheme
    @State private var start = Date()

    public init(data: [Double], color: Color = Linear.accent,
                loopDuration: Double = 3.0, tailLength: Double = 0.22,
                blurRadius: CGFloat = 6, coreWidth: CGFloat = 2.0,
                tailWidth: CGFloat = 4.5, showHead: Bool = true,
                padY: CGFloat = 0) {
        self.data = data; self.color = color
        self.loopDuration = loopDuration; self.tailLength = tailLength
        self.blurRadius = blurRadius; self.coreWidth = coreWidth
        self.tailWidth = tailWidth; self.showHead = showHead; self.padY = padY
    }

    public var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { ctx in
            let elapsed = ctx.date.timeIntervalSince(start)
            // Fire once — clamp to [0, 1] so the trail runs end-to-end and then
            // fades (tail trimmed to a zero-length segment past 1 + tailLength).
            let done = elapsed > loopDuration + tailLength * loopDuration
            let raw = min(1.0, max(0, elapsed / loopDuration))
            let progress = easeInOut(raw)
            let dark = scheme == .dark
            let blend: GraphicsContext.BlendMode = dark ? .plusLighter : .normal
            let tailAlpha: Double = dark ? 0.85 : 0.55

            Canvas { context, size in
                guard data.count > 1, !done else { return }
                var path = Path()
                sparkPath(&path, data: data, size: size)
                if padY > 0 {
                    let t = CGAffineTransform(translationX: 0, y: padY)
                    path = path.applying(t)
                }

                let lowerBound = progress - tailLength
                let trimFrom = max(0, lowerBound)
                let trimTo = min(1.0, progress)
                guard trimFrom < trimTo else { return }

                // Trail
                var glow = context
                glow.blendMode = blend
                glow.addFilter(.blur(radius: blurRadius))
                let trail = path.trimmedPath(from: trimFrom, to: trimTo)
                glow.stroke(trail, with: .color(color.opacity(tailAlpha)),
                            lineWidth: tailWidth)

                // Core
                let coreFrom = max(trimFrom, progress - tailLength * 0.35)
                if coreFrom < trimTo {
                    let core = path.trimmedPath(from: coreFrom, to: trimTo)
                    context.stroke(core, with: .color(color),
                                   style: StrokeStyle(lineWidth: coreWidth,
                                                      lineCap: .round, lineJoin: .round))
                }

                // Head (only while trail is moving)
                if showHead && progress < 1.0 {
                    let headSlice = path.trimmedPath(
                        from: max(0, progress - 0.001),
                        to: min(1, progress + 0.001))
                    let box = headSlice.boundingRect
                    let head = CGPoint(x: box.midX, y: box.midY)
                    var bright = context
                    bright.blendMode = blend
                    bright.addFilter(.blur(radius: 3))
                    bright.fill(
                        Path(ellipseIn: CGRect(x: head.x - 5, y: head.y - 5, width: 10, height: 10)),
                        with: .color(color.opacity(dark ? 1.0 : 0.6)))
                    context.fill(
                        Path(ellipseIn: CGRect(x: head.x - 2, y: head.y - 2, width: 4, height: 4)),
                        with: .color(dark ? Color.white.opacity(0.95) : color))
                }
            }
        }
        .onChange(of: data) { _, _ in start = Date() }
    }

    private func easeInOut(_ t: Double) -> Double {
        t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
    }
}

// MARK: - Live indicator (auto-refresh)

/// Shows "LIVE · Ns ago" with pulsing dot; reads `store.lastRefresh` and ticks
/// every second so elapsed time stays current.
public struct LiveIndicator: View {
    let lastRefresh: Date
    public init(lastRefresh: Date) { self.lastRefresh = lastRefresh }
    public var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let elapsed = Int(max(0, ctx.date.timeIntervalSince(lastRefresh)))
            HStack(spacing: 6) {
                LiveDot(color: Linear.success)
                Text("LIVE")
                    .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Linear.success)
                Text("·")
                    .foregroundStyle(Linear.ink4)
                Text(elapsedLabel(elapsed))
                    .font(.system(size: 10.5, design: .monospaced))
                    .foregroundStyle(Linear.ink3)
            }
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Linear.success.opacity(0.08))
            .overlay(RoundedRectangle(cornerRadius: 5)
                .stroke(Linear.success.opacity(0.22), lineWidth: 0.5))
            .clipShape(RoundedRectangle(cornerRadius: 5))
        }
    }
    private func elapsedLabel(_ s: Int) -> String {
        if s < 60 { return "\(s)s ago" }
        if s < 3600 { return "\(s/60)m ago" }
        return "\(s/3600)h ago"
    }
}

// MARK: - Tooltip

public struct ChartTooltip: View {
    let label: String
    let value: String
    public init(label: String, value: String) { self.label = label; self.value = value }
    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(Linear.ink3)
            Text(value)
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .foregroundStyle(Linear.ink0)
        }
        .padding(.horizontal, 8).padding(.vertical, 5)
        .background(Linear.panelHi)
        .overlay(RoundedRectangle(cornerRadius: 6)
            .stroke(Linear.borderHi, lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
    }
}

// MARK: - Interactive area chart with hover tooltip

public struct InteractiveAreaChart: View {
    let data: [Double]
    let labels: [String]
    let format: (Double) -> String
    var color: Color = Linear.accent
    @State private var hoverX: CGFloat? = nil

    public init(data: [Double], labels: [String],
                format: @escaping (Double) -> String,
                color: Color = Linear.accent) {
        self.data = data; self.labels = labels
        self.format = format; self.color = color
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            ZStack {
                AreaChartLinear(data: data, color: color)
                if let i = hoveredIndex(width: w), data.indices.contains(i) {
                    let x = pointX(i, w: w)
                    let y = pointY(i, h: h)
                    Rectangle()
                        .fill(Linear.ink3.opacity(0.25))
                        .frame(width: 1)
                        .position(x: x, y: h / 2)
                    Circle()
                        .fill(color)
                        .frame(width: 7, height: 7)
                        .overlay(Circle().stroke(Color.white.opacity(0.5), lineWidth: 1))
                        .position(x: x, y: y)
                    ChartTooltip(label: labels[safe: i] ?? "", value: format(data[i]))
                        .fixedSize()
                        .position(
                            x: min(max(x, 60), w - 60),
                            y: max(24, y - 28))
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

    private func hoveredIndex(width w: CGFloat) -> Int? {
        guard let hx = hoverX, data.count > 0 else { return nil }
        let step = data.count > 1 ? w / CGFloat(data.count - 1) : w
        let i = Int((hx / step).rounded())
        return min(max(i, 0), data.count - 1)
    }
    private func pointX(_ i: Int, w: CGFloat) -> CGFloat {
        data.count > 1 ? w / CGFloat(data.count - 1) * CGFloat(i) : w / 2
    }
    private func pointY(_ i: Int, h: CGFloat) -> CGFloat {
        let maxV = max(data.max() ?? 1, 0.0001)
        return h - (CGFloat(data[i]) / CGFloat(maxV)) * (h - 8) - 4
    }
}

// MARK: - Interactive hourly bars

public struct InteractiveHourlyBars: View {
    let values: [Int]
    let format: (Int) -> String
    let labelFor: (Int) -> String
    var color: Color = Linear.accent
    @State private var hoverX: CGFloat? = nil

    public init(values: [Int], format: @escaping (Int) -> String,
                labelFor: @escaping (Int) -> String, color: Color = Linear.accent) {
        self.values = values; self.format = format
        self.labelFor = labelFor; self.color = color
    }

    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let count = max(values.count, 1)
            let gap: CGFloat = 2
            let barW = max(1, w / CGFloat(count) - gap)
            let maxV = max(values.max() ?? 1, 1)
            let hovered = hoveredIndex(width: w, barW: barW)
            ZStack(alignment: .bottomLeading) {
                ForEach(0..<count, id: \.self) { i in
                    let v = CGFloat(values[i]) / CGFloat(maxV)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color.opacity(values[i] > 0
                                            ? (hovered == i ? 1.0 : 0.9)
                                            : 0.15))
                        .frame(width: barW, height: max(2, v * (h - 24)))
                        .offset(x: CGFloat(i) * (barW + gap), y: 0)
                }
                if let i = hovered {
                    let x = CGFloat(i) * (barW + gap) + barW / 2
                    let v = CGFloat(values[i]) / CGFloat(maxV)
                    let barY = h - max(2, v * (h - 24))
                    ChartTooltip(label: labelFor(i), value: format(values[i]))
                        .fixedSize()
                        .position(x: min(max(x, 50), w - 50),
                                  y: max(22, barY - 22))
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

    private func hoveredIndex(width w: CGFloat, barW: CGFloat) -> Int? {
        guard let hx = hoverX, !values.isEmpty else { return nil }
        let i = Int(hx / (barW + 2))
        return min(max(i, 0), values.count - 1)
    }
}

private extension Array {
    subscript(safe i: Int) -> Element? {
        indices.contains(i) ? self[i] : nil
    }
}

// MARK: - Area chart (30-day spend)

public struct AreaChartLinear: View {
    let data: [Double]
    var color: Color = Linear.accent
    public init(data: [Double], color: Color = Linear.accent) {
        self.data = data; self.color = color
    }
    public var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let maxV = max(data.max() ?? 1, 0.0001)
            let pts: [CGPoint] = data.enumerated().map { i, v in
                let x = data.count > 1 ? w / CGFloat(data.count - 1) * CGFloat(i) : w / 2
                let y = h - (CGFloat(v) / CGFloat(maxV)) * (h - 8) - 4
                return CGPoint(x: x, y: y)
            }
            ZStack {
                // Area
                Path { p in
                    guard let first = pts.first else { return }
                    p.move(to: CGPoint(x: first.x, y: h))
                    p.addLine(to: first)
                    for pt in pts.dropFirst() { p.addLine(to: pt) }
                    if let last = pts.last { p.addLine(to: CGPoint(x: last.x, y: h)) }
                    p.closeSubpath()
                }
                .fill(LinearGradient(colors: [color.opacity(0.30), color.opacity(0.0)],
                                     startPoint: .top, endPoint: .bottom))
                // Baseline (dim)
                Path { p in
                    for (i, pt) in pts.enumerated() {
                        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
                    }
                }
                .stroke(color.opacity(0.45),
                        style: StrokeStyle(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                // Comet — shares the same scaling as the line above
                AreaCometOverlay(data: data, color: color)
            }
        }
    }
}

/// Comet that rides the AreaChartLinear line path (uses same y-padding math).
private struct AreaCometOverlay: View {
    let data: [Double]
    let color: Color
    @Environment(\.colorScheme) private var scheme
    @State private var start = Date()
    var loopDuration: Double = 3.0
    var tailLength: Double = 0.22
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60)) { ctx in
            let elapsed = ctx.date.timeIntervalSince(start)
            // Run once: clamp progress to 1 and stop drawing after the tail
            // has fully slid off the end of the line.
            let done = elapsed > loopDuration + tailLength * loopDuration
            let raw = min(1.0, max(0, elapsed / loopDuration))
            let progress = easeInOut(raw)
            let dark = scheme == .dark
            let blend: GraphicsContext.BlendMode = dark ? .plusLighter : .normal
            Canvas { ctx, size in
                guard data.count > 1, !done else { return }
                let maxV = max(data.max() ?? 1, 0.0001)
                var path = Path()
                for (i, v) in data.enumerated() {
                    let x = size.width / CGFloat(data.count - 1) * CGFloat(i)
                    let y = size.height - (CGFloat(v) / CGFloat(maxV)) * (size.height - 8) - 4
                    if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                    else { path.addLine(to: CGPoint(x: x, y: y)) }
                }

                let trimFrom = max(0, progress - tailLength)
                let trimTo = min(1.0, progress)
                guard trimFrom < trimTo else { return }

                var glow = ctx
                glow.blendMode = blend
                glow.addFilter(.blur(radius: dark ? 8 : 6))
                let trail = path.trimmedPath(from: trimFrom, to: trimTo)
                glow.stroke(trail, with: .color(color.opacity(dark ? 0.9 : 0.5)),
                            lineWidth: dark ? 5 : 4)

                let coreFrom = max(trimFrom, progress - tailLength * 0.35)
                if coreFrom < trimTo {
                    let core = path.trimmedPath(from: coreFrom, to: trimTo)
                    ctx.stroke(core, with: .color(color),
                               style: StrokeStyle(lineWidth: 2.0,
                                                  lineCap: .round, lineJoin: .round))
                }

                if progress < 1.0 {
                    let headSlice = path.trimmedPath(
                        from: max(0, progress - 0.001),
                        to: min(1, progress + 0.001))
                    let box = headSlice.boundingRect
                    let head = CGPoint(x: box.midX, y: box.midY)
                    var bright = ctx
                    bright.blendMode = blend
                    bright.addFilter(.blur(radius: 4))
                    bright.fill(
                        Path(ellipseIn: CGRect(x: head.x - 6, y: head.y - 6, width: 12, height: 12)),
                        with: .color(color.opacity(dark ? 1.0 : 0.55)))
                    ctx.fill(
                        Path(ellipseIn: CGRect(x: head.x - 2.2, y: head.y - 2.2, width: 4.4, height: 4.4)),
                        with: .color(dark ? Color.white.opacity(0.95) : color))
                }
            }
        }
        .onChange(of: data) { _, _ in start = Date() }
    }
    private func easeInOut(_ t: Double) -> Double {
        t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2
    }
}
