import Foundation

public final class CostCalculator: @unchecked Sendable {
    public static let shared = CostCalculator()

    /// Bump when the lookup/pricing logic changes in a way that should re-cost
    /// already-stored rows. Rows with a lower pricing_version are recomputed once
    /// by SessionsRepo.backfillPricing. v1 = exact-match lookup (no fuzzy fallback).
    public static let currentPricingVersion = 1

    private let pricing: [String: ModelPricing]

    public convenience init() {
        // In a shipped .app read pricing.json from Contents/Resources/
        // via Bundle.main. Only fall back to Bundle.module in dev/test —
        // merely referencing Bundle.module on an end-user Mac triggers
        // SwiftPM's generated accessor which fatalErrors on missing
        // build-dir paths.
        let bundle: Bundle
        if Bundle.main.bundlePath.hasSuffix(".app") {
            bundle = Bundle.main
        } else {
            bundle = Bundle.module
        }
        self.init(bundle: bundle)
    }

    internal init(bundle: Bundle) {
        self.pricing = Self.load(bundle: bundle)
    }

    private static func load(bundle: Bundle) -> [String: ModelPricing] {
        guard let url = bundle.url(forResource: "pricing", withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            return [:]
        }
        return (try? JSONDecoder().decode([String: ModelPricing].self, from: data)) ?? [:]
    }

    /// Deterministic normalization candidates: from the most specific id, strip
    /// recognized trailing markers one at a time (@YYYYMMDD, :N, -vN, -YYYYMMDD)
    /// and match each EXACTLY. Never a substring scan — that silently mis-priced
    /// new models against unrelated siblings (e.g. gemini-3-pro -> *-image-preview).
    /// Mirrors candidateKeys() in cli/src/services/cost-calculator.ts.
    static func candidateKeys(_ model: String) -> [String] {
        var out: [String] = []
        var seen = Set<String>()
        func push(_ k: String) { if !k.isEmpty && !seen.contains(k) { seen.insert(k); out.append(k) } }
        push(model)
        var cur = model
        for _ in 0..<8 {
            var next = cur
            if let r = next.range(of: #"@\d{8}$"#, options: .regularExpression) { next.removeSubrange(r) }
            else if let r = next.range(of: #":\d+$"#, options: .regularExpression) { next.removeSubrange(r) }
            else if let r = next.range(of: #"-v\d+$"#, options: .regularExpression) { next.removeSubrange(r) }
            else if let r = next.range(of: #"-\d{8}$"#, options: .regularExpression) { next.removeSubrange(r) }
            if next == cur { break }
            push(next)
            cur = next
        }
        return out
    }

    public func lookup(_ model: String) -> ModelPricing? {
        for key in Self.candidateKeys(model) {
            if let p = pricing[key] { return p }
        }
        return nil
    }

    /// Whether the model has a known price. Unknown models are "unpriced" (cost $0
    /// as a placeholder), distinct from a genuine $0 — callers should flag them.
    public func isPriced(_ model: String) -> Bool {
        lookup(model) != nil
    }

    /// Returns cost in millicents (1/1000 of a cent).
    public func cost(
        model: String,
        inputTokens: Int, outputTokens: Int,
        cacheReadTokens: Int = 0, cacheWriteTokens: Int = 0
    ) -> Int {
        guard let price = lookup(model) else { return 0 }
        let dollars =
            Double(inputTokens) / 1_000_000.0 * price.inputPerMillion +
            Double(outputTokens) / 1_000_000.0 * price.outputPerMillion +
            Double(cacheReadTokens) / 1_000_000.0 * price.cacheReadPerMillion +
            Double(cacheWriteTokens) / 1_000_000.0 * price.cacheWritePerMillion
        return Int((dollars * 100_000).rounded())
    }
}
