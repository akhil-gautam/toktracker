import Foundation

public final class CostCalculator: @unchecked Sendable {
    public static let shared = CostCalculator()

    private let pricing: [String: ModelPricing]

    public convenience init() {
        self.init(bundle: .module)
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

    public func lookup(_ model: String) -> ModelPricing? {
        if let exact = pricing[model] { return exact }
        let lower = model.lowercased()
        if let match = pricing.first(where: { $0.key.lowercased() == lower })?.value {
            return match
        }
        return pricing
            .filter { lower.contains($0.key.lowercased()) || $0.key.lowercased().contains(lower) }
            .sorted { $0.key.count > $1.key.count }
            .first?.value
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
