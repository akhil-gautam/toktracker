import XCTest
@testable import Parsers
import Core

final class ClaudeCodeParserTests: XCTestCase {
    func testParsesAssistantSessionsFromFixture() async throws {
        guard let fixture = Bundle.module.url(forResource: "claude-code", withExtension: "jsonl",
                                              subdirectory: "Fixtures") else {
            XCTFail("missing fixture")
            return
        }
        let parser = ClaudeCodeParser()
        let result = try await parser.parse(path: fixture, fromOffset: 0)
        XCTAssertGreaterThan(result.sessions.count, 0)
        XCTAssertTrue(result.sessions.allSatisfy { $0.tool == .claudeCode })
        XCTAssertTrue(result.sessions.contains { $0.model.contains("sonnet") || $0.model.contains("opus") })
        XCTAssertEqual(result.newOffset, Int(try FileManager.default.attributesOfItem(atPath: fixture.path)[.size] as? Int ?? 0))
        XCTAssertTrue(result.messages.count > 0)
    }

    func testCursorResume() async throws {
        guard let fixture = Bundle.module.url(forResource: "claude-code", withExtension: "jsonl",
                                              subdirectory: "Fixtures") else {
            XCTFail("missing fixture"); return
        }
        let parser = ClaudeCodeParser()
        let full = try await parser.parse(path: fixture, fromOffset: 0)
        let resumed = try await parser.parse(path: fixture, fromOffset: full.newOffset)
        XCTAssertEqual(resumed.sessions.count, 0)
    }
}
