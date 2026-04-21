import SwiftUI
import Core

/// 30-day cost line with a looping "comet" that traces along it,
/// trailing a fading glow — evokes fire moving along a fuse.
struct GlowingSpendChart: View {
    let values: [Int]            // per-day cost, millicents
    var loopDuration: Double = 3.0
    var tailLength: Double = 0.22  // fraction of path length
    var height: CGFloat = 100

    @Environment(\.colorScheme) private var scheme
    @State private var start = Date()
    @State private var done = false

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60, paused: done)) { ctx in
            let elapsed = ctx.date.timeIntervalSince(start)
            let progress = min(1.0, elapsed / loopDuration)
            let dark = scheme == .dark

            // Scheme-aware palette. On light mode, warm amber at low alpha
            // reads as a soft glow instead of a solid stripe.
            let trailColor = dark ? Palette.accentHi : Palette.accent
            let coreColor  = dark ? Palette.accentHi : Palette.accentDeepHi
            let haloColor  = dark ? Palette.accentHi : Palette.accent
            let headColor  = dark ? Color.white.opacity(0.95)
                                  : Palette.accentDeep.opacity(0.85)
            let baselineColor = dark ? Palette.accent.opacity(0.35)
                                     : Palette.accentDeep.opacity(0.28)
            let areaTop = dark ? Palette.accent.opacity(0.28)
                               : Palette.accent.opacity(0.14)
            let areaBot = dark ? Palette.accent.opacity(0.02)
                               : Palette.accent.opacity(0.00)
            let blend: GraphicsContext.BlendMode = dark ? .plusLighter : .normal
            let trailAlpha: Double = dark ? 0.85 : 0.45
            let trailWidth: CGFloat = dark ? 5 : 3.5
            let coreWidth: CGFloat = dark ? 2.4 : 1.8
            let haloAlpha: Double = dark ? 1.0 : 0.55

            Canvas { context, size in
                guard values.count > 1 else { return }

                let path = linePath(in: size)
                let fillPath = closedAreaPath(in: size)

                context.fill(
                    fillPath,
                    with: .linearGradient(
                        Gradient(colors: [areaTop, areaBot]),
                        startPoint: .zero,
                        endPoint: CGPoint(x: 0, y: size.height)))

                context.stroke(path, with: .color(baselineColor), lineWidth: 1.4)

                // Once the animation finishes, leave only the baseline + area
                // fill in place so the trail doesn't appear parked at the end.
                if done { return }

                var glow = context
                glow.blendMode = blend
                glow.addFilter(.blur(radius: dark ? 8 : 6))
                let trail = path.trimmedPath(
                    from: max(0, progress - tailLength),
                    to: progress)
                glow.stroke(
                    trail,
                    with: .color(trailColor.opacity(trailAlpha)),
                    lineWidth: trailWidth)

                let core = path.trimmedPath(
                    from: max(0, progress - tailLength * 0.35),
                    to: progress)
                context.stroke(
                    core,
                    with: .color(coreColor),
                    style: StrokeStyle(lineWidth: coreWidth, lineCap: .round, lineJoin: .round))

                if let head = headPoint(progress, size: size) {
                    var bright = context
                    bright.blendMode = blend
                    bright.addFilter(.blur(radius: 4))
                    bright.fill(
                        Path(ellipseIn: CGRect(x: head.x - 7, y: head.y - 7, width: 14, height: 14)),
                        with: .color(haloColor.opacity(haloAlpha)))
                    context.fill(
                        Path(ellipseIn: CGRect(x: head.x - 2.5, y: head.y - 2.5, width: 5, height: 5)),
                        with: .color(headColor))
                }
            }
        }
        .frame(height: height)
        .task(id: values) {
            start = Date()
            done = false
            try? await Task.sleep(nanoseconds: UInt64((loopDuration + 0.1) * 1_000_000_000))
            done = true
        }
    }

    private func linePath(in size: CGSize) -> Path {
        var p = Path()
        guard values.count > 1 else { return p }
        let maxV = CGFloat(max(1, values.max() ?? 1))
        let stepX = size.width / CGFloat(values.count - 1)
        let padY: CGFloat = 6
        let plotH = size.height - padY * 2

        func y(for v: Int) -> CGFloat {
            let ratio = CGFloat(v) / maxV
            return padY + plotH * (1 - ratio)
        }

        p.move(to: CGPoint(x: 0, y: y(for: values[0])))
        for i in 1..<values.count {
            let prev = CGPoint(x: stepX * CGFloat(i - 1), y: y(for: values[i - 1]))
            let curr = CGPoint(x: stepX * CGFloat(i),     y: y(for: values[i]))
            let c1 = CGPoint(x: (prev.x + curr.x) / 2, y: prev.y)
            let c2 = CGPoint(x: (prev.x + curr.x) / 2, y: curr.y)
            p.addCurve(to: curr, control1: c1, control2: c2)
        }
        return p
    }

    private func closedAreaPath(in size: CGSize) -> Path {
        var p = linePath(in: size)
        p.addLine(to: CGPoint(x: size.width, y: size.height))
        p.addLine(to: CGPoint(x: 0, y: size.height))
        p.closeSubpath()
        return p
    }

    /// Sample the path at `progress` by trimming a very short segment and
    /// reading its starting point — good enough for a small glow dot.
    private func headPoint(_ progress: Double, size: CGSize) -> CGPoint? {
        let path = linePath(in: size)
        let slice = path.trimmedPath(
            from: max(0, progress - 0.001),
            to: min(1, progress + 0.001))
        let box = slice.boundingRect
        guard box.width > 0 || box.height > 0 else {
            return CGPoint(x: box.midX, y: box.midY)
        }
        return CGPoint(x: box.midX, y: box.midY)
    }

}
