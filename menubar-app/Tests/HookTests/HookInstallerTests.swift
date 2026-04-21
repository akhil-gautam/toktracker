import XCTest
@testable import Hook
import Core

final class HookInstallerTests: XCTestCase {
    func testInstallAndUninstallRoundtrip() throws {
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("tokscale-hook-\(UUID().uuidString)")
            .appendingPathComponent("settings.json")
        defer { try? FileManager.default.removeItem(at: tmp.deletingLastPathComponent()) }

        let hook = URL(fileURLWithPath: "/usr/local/bin/tokscale-hook")
        try HookInstaller.install(at: tmp, hookBinary: hook)

        var status = HookInstaller.status(at: tmp)
        XCTAssertTrue(status.installed)
        XCTAssertEqual(Set(status.kinds), Set(HookInstaller.kinds))

        let raw = try String(contentsOf: tmp)
        XCTAssertTrue(raw.contains("tokscale_macos_managed"))

        try HookInstaller.uninstall(at: tmp)
        status = HookInstaller.status(at: tmp)
        XCTAssertFalse(status.installed)
        XCTAssertTrue(status.kinds.isEmpty)
    }

    func testInstallPreservesExistingEntries() throws {
        let tmp = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("tokscale-hook-\(UUID().uuidString)")
            .appendingPathComponent("settings.json")
        defer { try? FileManager.default.removeItem(at: tmp.deletingLastPathComponent()) }

        try FileManager.default.createDirectory(at: tmp.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        let seed = """
        {
          "hooks": {
            "PreToolUse": [
              {"matcher": "*", "hooks": [{"type": "command", "command": "other"}]}
            ]
          }
        }
        """
        try seed.write(to: tmp, atomically: true, encoding: .utf8)

        let hook = URL(fileURLWithPath: "/usr/local/bin/tokscale-hook")
        try HookInstaller.install(at: tmp, hookBinary: hook)

        let raw = try String(contentsOf: tmp)
        XCTAssertTrue(raw.contains("\"other\""), "existing entry must survive")
        XCTAssertTrue(raw.contains("tokscale_macos_managed"))
    }
}
