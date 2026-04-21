import XCTest
@testable import Parsers
import Core

final class GeminiParserTests: XCTestCase {
    func testParsesFixture() async throws {
        guard let url = Bundle.module.url(forResource: "gemini-session", withExtension: "json",
                                          subdirectory: "Fixtures") else {
            XCTFail("missing fixture"); return
        }
        let parser = GeminiParser()
        let result = try await parser.parse(path: url, fromOffset: 0)
        XCTAssertTrue(result.sessions.allSatisfy { $0.tool == .geminiCli })
        XCTAssertTrue(result.sessions.allSatisfy { $0.estimated })
    }
}
