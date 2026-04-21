import XCTest
@testable import Parsers
import Core

final class CodexParserTests: XCTestCase {
    func testParsesFixture() async throws {
        guard let url = Bundle.module.url(forResource: "codex", withExtension: "jsonl",
                                          subdirectory: "Fixtures") else {
            XCTFail("missing fixture"); return
        }
        let parser = CodexParser()
        let result = try await parser.parse(path: url, fromOffset: 0)
        XCTAssertTrue(result.sessions.allSatisfy { $0.tool == .codex })
        XCTAssertGreaterThan(result.newOffset, 0)
    }
}
