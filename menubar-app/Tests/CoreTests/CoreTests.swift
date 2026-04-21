import XCTest
@testable import Core

final class CoreTests: XCTestCase {
    func testCostCalculatorLoads() {
        let calc = CostCalculator()
        let cost = calc.cost(model: "claude-opus-4", inputTokens: 1_000_000, outputTokens: 0)
        XCTAssertGreaterThanOrEqual(cost, 0)
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
