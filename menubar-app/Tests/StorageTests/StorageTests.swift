import XCTest
@testable import Storage

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
}
