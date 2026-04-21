import XCTest
@testable import Parsers
import Core

final class RealCodexDiagnostic: XCTestCase {
    func testRealCodexFileEmitsSessions() async throws {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let codexDir = home.appendingPathComponent(".codex/sessions")
        guard FileManager.default.fileExists(atPath: codexDir.path) else {
            throw XCTSkip("no codex dir")
        }
        guard let enumerator = FileManager.default.enumerator(at: codexDir, includingPropertiesForKeys: nil) else {
            throw XCTSkip("no files")
        }
        var url: URL?
        for case let u as URL in enumerator where u.pathExtension == "jsonl" {
            url = u; break
        }
        guard let url else { throw XCTSkip("no jsonl") }
        print("codex file:", url.path)
        let parser = CodexParser()
        let result = try await parser.parse(path: url, fromOffset: 0)
        print("sessions:", result.sessions.count, "newOffset:", result.newOffset)
        if let first = result.sessions.first {
            print("first session model:", first.model, "started:", first.startedAt, "cost_mc:", first.costMillicents)
        }
        XCTAssertGreaterThan(result.sessions.count, 0, "real codex file should produce sessions")
    }
}
