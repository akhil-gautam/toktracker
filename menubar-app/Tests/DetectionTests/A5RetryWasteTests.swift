import XCTest
@testable import Detection
import Storage
import Core

final class A5RetryWasteTests: XCTestCase {
    func testFiresWhenManyFailedCallsWithTokens() throws {
        let tmp = NSTemporaryDirectory() + "a5-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)

        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at) VALUES ('s1','claude_code','opus', ?)
                """, arguments: [Int(Date().timeIntervalSince1970 * 1000)])
            try db.execute(sql: """
                INSERT INTO messages (id, session_id, turn_index, role, content_hash, created_at)
                VALUES (1, 's1', 0, 'assistant', 'h', ?)
                """, arguments: [Int(Date().timeIntervalSince1970 * 1000)])
            for _ in 0..<4 {
                try db.execute(sql: """
                    INSERT INTO tool_calls (message_id, session_id, tool_name, args_hash, args_json, succeeded, tokens_returned, created_at)
                    VALUES (1,'s1','Bash','h','{}',0,200,?)
                    """, arguments: [Int(Date().timeIntervalSince1970 * 1000)])
            }
        }
        let ctx = DetectionContext(trigger: .stop, db: db, sessionId: "s1")
        let det = A5RetryFailureWaste().evaluate(context: ctx)
        XCTAssertNotNil(det)
        XCTAssertEqual(det?.severity, .warn)
    }

    func testQuietWhenBelowThreshold() throws {
        let tmp = NSTemporaryDirectory() + "a5q-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at) VALUES ('s1','claude_code','opus', ?)
                """, arguments: [Int(Date().timeIntervalSince1970 * 1000)])
        }
        let ctx = DetectionContext(trigger: .stop, db: db, sessionId: "s1")
        XCTAssertNil(A5RetryFailureWaste().evaluate(context: ctx))
    }
}
