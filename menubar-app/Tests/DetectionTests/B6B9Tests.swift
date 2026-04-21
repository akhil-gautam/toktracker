import XCTest
@testable import Detection
import Storage
import Core

final class B6B9Tests: XCTestCase {
    func testB6FiresWhenSameHashAppearsEnoughTimes() throws {
        let tmp = NSTemporaryDirectory() + "b6-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)
        let now = Int(Date().timeIntervalSince1970 * 1000)
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at) VALUES ('s1','claude_code','opus', ?)
                """, arguments: [now])
            for _ in 0..<4 {
                try db.execute(sql: """
                    INSERT INTO messages (session_id, turn_index, role, content_hash, content_redacted, created_at)
                    VALUES ('s1',0,'user','same-hash','hi',?)
                    """, arguments: [now])
            }
        }
        let ctx = DetectionContext(trigger: .userPromptSubmit, db: db, sessionId: "s1")
        XCTAssertNotNil(B6RepeatQuestion().evaluate(context: ctx))
    }

    func testB9MinesCommonPrefix() throws {
        let tmp = NSTemporaryDirectory() + "b9-\(UUID().uuidString).db"
        defer { try? FileManager.default.removeItem(atPath: tmp) }
        let db = try Boot.open(path: tmp)
        let now = Int(Date().timeIntervalSince1970 * 1000)
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO sessions (id, tool, model, started_at) VALUES ('s1','claude_code','opus', ?)
                """, arguments: [now])
            for i in 0..<4 {
                try db.execute(sql: """
                    INSERT INTO messages (session_id, turn_index, role, content_hash, content_redacted, created_at)
                    VALUES ('s1',?, 'user', 'h\(i)', 'please fix this bug in file \(i)', ?)
                    """, arguments: [i, now])
            }
        }
        let ctx = DetectionContext(trigger: .stop, db: db)
        let det = B9PromptPattern().evaluate(context: ctx)
        XCTAssertNotNil(det)
        XCTAssertTrue(det?.summary.contains("please fix this") ?? false)
    }
}
