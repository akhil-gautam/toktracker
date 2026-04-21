import Foundation

public enum Formatters {
    public static func cost(millicents: Int) -> String {
        let dollars = Double(millicents) / 100_000.0
        if dollars >= 100 { return String(format: "$%.0f", dollars) }
        if dollars >= 1 { return String(format: "$%.2f", dollars) }
        return String(format: "$%.3f", dollars)
    }

    public static func tokens(_ n: Int) -> String {
        if n >= 1_000_000_000_000 { return String(format: "%.2fT", Double(n) / 1_000_000_000_000) }
        if n >= 1_000_000_000 { return String(format: "%.2fB", Double(n) / 1_000_000_000) }
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1_000_000) }
        if n >= 1_000 { return String(format: "%.1fK", Double(n) / 1_000) }
        return "\(n)"
    }
}

public enum Theme {
    public static func color(forTool tool: Tool) -> String {
        switch tool {
        case .claudeCode: return "#d97757"
        case .codex: return "#10a37f"
        case .opencode: return "#7c3aed"
        case .geminiCli: return "#4285f4"
        }
    }
}
