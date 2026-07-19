import XCTest
@testable import Core

final class CoreTests: XCTestCase {
    func testCostCalculatorLoads() {
        let calc = CostCalculator()
        let cost = calc.cost(model: "claude-opus-4", inputTokens: 1_000_000, outputTokens: 0)
        XCTAssertGreaterThanOrEqual(cost, 0)
    }

    func testLookupExactAndUnpriced() {
        let calc = CostCalculator()
        // Known model: priced, non-zero.
        XCTAssertTrue(calc.isPriced("claude-opus-4-6"))
        XCTAssertGreaterThan(calc.cost(model: "claude-opus-4-6", inputTokens: 1_000_000, outputTokens: 0), 0)
        // Brand-new model must NOT fuzzy-match a sibling (e.g. *-image-preview).
        XCTAssertFalse(calc.isPriced("gemini-3-pro"))
        XCTAssertEqual(calc.cost(model: "gemini-3-pro", inputTokens: 1_000_000, outputTokens: 0), 0)
        XCTAssertFalse(calc.isPriced("gpt"))
    }

    func testLookupStripsDateSuffix() {
        let calc = CostCalculator()
        // A future-dated variant not in the catalog falls back to the base family.
        XCTAssertTrue(calc.isPriced("claude-sonnet-4-5-20991231"))
        XCTAssertEqual(
            calc.lookup("claude-sonnet-4-5-20991231")?.inputPerMillion,
            calc.lookup("claude-sonnet-4-5")?.inputPerMillion)
    }

    func testCurrentModelPricing() {
        let calc = CostCalculator()
        let currentModels: [(String, Double, Double, Double)] = [
            ("gpt-5.6", 5, 30, 0.5),
            ("gpt-5.6-terra", 2.5, 15, 0.25),
            ("gpt-5.6-luna", 1, 6, 0.1),
            ("claude-opus-4-8", 5, 25, 0.5),
            ("claude-sonnet-5", 2, 10, 0.2),
            ("gemini-3.5-flash", 1.5, 9, 0.15),
        ]

        for (model, input, output, cacheRead) in currentModels {
            let pricing = calc.lookup(model)
            XCTAssertEqual(pricing?.inputPerMillion, input, model)
            XCTAssertEqual(pricing?.outputPerMillion, output, model)
            XCTAssertEqual(pricing?.cacheReadPerMillion, cacheRead, model)
        }
    }

    func testSonnetAliasUsesSonnet5Pricing() {
        let calc = CostCalculator()
        XCTAssertEqual(calc.lookup("sonnet"), calc.lookup("claude-sonnet-5"))
    }

    func testFormattersCost() {
        XCTAssertEqual(Formatters.cost(millicents: 1_234_000), "$12.34")
        XCTAssertEqual(Formatters.cost(millicents: 500), "$0.005")
    }

    func testFormattersTokens() {
        XCTAssertEqual(Formatters.tokens(999), "999")
        XCTAssertEqual(Formatters.tokens(1_500), "1.5K")
        XCTAssertEqual(Formatters.tokens(2_500_000), "2.5M")
    }
}
