import XCTest
@testable import Parsers

final class DiscoverTest: XCTestCase {
    func testCodexDiscoverRecurses() throws {
        let parser = CodexParser()
        let files = try parser.discover()
        print("codex files discovered:", files.count)
        for f in files.prefix(3) { print(" -", f.path) }
    }
}
