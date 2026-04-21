import XCTest
@testable import Detection
import Storage
import Core

final class C12KillswitchTests: XCTestCase {
    func testBlocksWhenSessionExceedsCeiling() throws {
        let tmp = NSTemporaryDirectory() + "tokscale-c12-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)

        // Insert a session with 3000 cents ($30) in cost_millicents = 300,000
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at, cost_millicents)
                VALUES ('s1', 'claude_code', 'claude-opus-4', ?, ?)
                """,
                arguments: [Int(Date().timeIntervalSince1970 * 1000), 3_000_000])
        }

        let rule = C12RunawayKillswitch()
        let ctx = DetectionContext(
            trigger: .preToolUse, db: db, sessionId: "s1",
            thresholds: ["ceiling_cents": 2000])
        let det = rule.evaluate(context: ctx)
        XCTAssertNotNil(det)
        XCTAssertEqual(det?.severity, .block)
    }

    func testDoesNotBlockBelowCeiling() throws {
        let tmp = NSTemporaryDirectory() + "tokscale-c12-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)

        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at, cost_millicents)
                VALUES ('s1', 'claude_code', 'claude-opus-4', ?, 1000000)
                """, arguments: [Int(Date().timeIntervalSince1970 * 1000)])
        }
        let rule = C12RunawayKillswitch()
        let ctx = DetectionContext(
            trigger: .preToolUse, db: db, sessionId: "s1",
            thresholds: ["ceiling_cents": 2000])
        XCTAssertNil(rule.evaluate(context: ctx))
    }
}
