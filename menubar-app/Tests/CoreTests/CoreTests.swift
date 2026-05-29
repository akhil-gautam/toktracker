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
