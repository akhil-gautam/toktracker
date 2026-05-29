import XCTest
@testable import Storage
import Core
import GRDB

final class StorageTests: XCTestCase {
    func testOpenInMemory() throws {
        let tmp = NSTemporaryDirectory() + "tokscale-test-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)
        let count = try db.queue.read { db in
            try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM sessions") ?? -1
        }
        XCTAssertEqual(count, 0)
    }

    func testBackfillRecostsLegacyRows() throws {
        let tmp = NSTemporaryDirectory() + "tokscale-test-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)

        // Three legacy rows (pricing_version = 0) with deliberately-wrong costs.
        try db.queue.write { d in
            let sql = """
                INSERT INTO sessions (id, conversation_id, tool, model, started_at,
                    input_tokens, output_tokens, cache_read, cache_write,
                    cost_millicents, estimated, unpriced, pricing_version)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """
            // priced model, bogus stored cost
            try d.execute(sql: sql, arguments: ["a","a","claude_code","claude-opus-4-6", 0, 1_000_000, 0, 0, 0, 999_999, 0, 0, 0])
            // unpriced model, bogus nonzero cost from the old fuzzy match
            try d.execute(sql: sql, arguments: ["b","b","gemini_cli","gemini-3-pro", 0, 1_000_000, 0, 0, 0, 12_345, 0, 0, 0])
            // opencode: cost is authoritative, must be preserved
            try d.execute(sql: sql, arguments: ["c","c","opencode","whatever", 0, 1_000_000, 0, 0, 0, 5_000, 0, 0, 0])
        }

        let n = try SessionsRepo(db: db).backfillPricing()
        XCTAssertEqual(n, 3)

        let rows = try db.queue.read { d in
            try Row.fetchAll(d, sql: "SELECT id, cost_millicents, unpriced, pricing_version FROM sessions ORDER BY id")
        }
        func row(_ id: String) -> Row { rows.first { ($0["id"] as String?) == id }! }

        // claude-opus-4-6 @ 1M input = $5 = 500_000 millicents (not the bogus 999_999)
        XCTAssertEqual(row("a")["cost_millicents"] as Int?, 500_000)
        XCTAssertEqual(row("a")["unpriced"] as Int?, 0)
        XCTAssertEqual(row("a")["pricing_version"] as Int?, CostCalculator.currentPricingVersion)

        // gemini-3-pro is unpriced now -> cost 0, flagged
        XCTAssertEqual(row("b")["cost_millicents"] as Int?, 0)
        XCTAssertEqual(row("b")["unpriced"] as Int?, 1)

        // opencode cost preserved, only version stamped
        XCTAssertEqual(row("c")["cost_millicents"] as Int?, 5_000)
        XCTAssertEqual(row("c")["pricing_version"] as Int?, CostCalculator.currentPricingVersion)

        // Idempotent: a second pass touches nothing.
        XCTAssertEqual(try SessionsRepo(db: db).backfillPricing(), 0)
    }
}
