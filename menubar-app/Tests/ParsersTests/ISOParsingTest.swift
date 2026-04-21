import XCTest
@testable import Parsers

final class ISOParsingTest: XCTestCase {
    func testFractionalParsed() {
        XCTAssertNotNil(ParserUtil.parseISO("2026-03-03T04:24:04.239Z"))
        XCTAssertNotNil(ParserUtil.parseISO("2026-03-03T04:24:04Z"))
        XCTAssertNil(ParserUtil.parseISO(nil))
        XCTAssertNil(ParserUtil.parseISO("garbage"))
    }

    func testCodexFixtureAllTimestampsParse() throws {
        guard let url = Bundle.module.url(forResource: "codex", withExtension: "jsonl",
                                          subdirectory: "Fixtures") else {
            throw XCTSkip("no fixture")
        }
        let text = try String(contentsOf: url)
        var good = 0, bad = 0
        for raw in text.split(separator: "\n") {
            guard let data = raw.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            if let ts = obj["timestamp"] as? String {
                if ParserUtil.parseISO(ts) != nil { good += 1 } else { bad += 1 }
            }
        }
        print("codex fixture: good=\(good) bad=\(bad)")
        XCTAssertGreaterThan(good, 0)
        XCTAssertEqual(bad, 0)
    }
}
