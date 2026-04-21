import XCTest
@testable import Storage
import Core

final class BudgetsRepoTests: XCTestCase {
    func testUpsertListDelete() throws {
        let tmp = NSTemporaryDirectory() + "budgets-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)
        let repo = BudgetsRepo(db: db)
        try repo.ensureSchema()

        let b = Budget(id: "b1", scope: .global, period: .daily, limitCents: 500, alertAtPct: 75)
        try repo.upsert(b)
        var all = try repo.all()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.limitCents, 500)

        var updated = b
        updated.limitCents = 1000
        try repo.upsert(updated)
        all = try repo.all()
        XCTAssertEqual(all.first?.limitCents, 1000)

        try repo.delete(id: "b1")
        XCTAssertEqual(try repo.all().count, 0)
    }

    func testSpendCalculator() throws {
        let tmp = NSTemporaryDirectory() + "spend-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)
        try BudgetsRepo(db: db).ensureSchema()

        let today = Int(Date().timeIntervalSince1970 * 1000)
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at, cost_millicents)
                VALUES ('s1','claude_code','opus',?, 250000)
                """, arguments: [today])
        }
        let budget = Budget(id: "b1", scope: .global, period: .daily, limitCents: 1000)
        XCTAssertEqual(BudgetCalculator.spend(budget: budget, db: db), 250000)
    }
}
