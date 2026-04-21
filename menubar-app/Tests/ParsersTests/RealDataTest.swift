import XCTest
@testable import Parsers
import Core

// One-shot diagnostic — reads a real Claude Code jsonl from ~/.claude/projects
// and counts sessions + messages + tool_calls produced by the parser.
final class RealDataDiagnostic: XCTestCase {
    func testRealFileEmitsMessages() async throws {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let projects = home.appendingPathComponent(".claude/projects")
        guard let enumerator = FileManager.default.enumerator(at: projects,
              includingPropertiesForKeys: nil) else {
            throw XCTSkip("no ~/.claude/projects")
        }
        var url: URL?
        for case let u as URL in enumerator where u.pathExtension == "jsonl" {
            url = u; break
        }
        guard let url else { throw XCTSkip("no jsonl files") }
        print("parsing:", url.path)
        let parser = ClaudeCodeParser()
        let result = try await parser.parse(path: url, fromOffset: 0)
        print("sessions:", result.sessions.count,
              "messages:", result.messages.count,
              "toolCalls:", result.toolCalls.count)
        XCTAssertGreaterThan(result.sessions.count, 0)
        XCTAssertGreaterThan(result.messages.count, 0, "parser should emit messages")
    }
}
