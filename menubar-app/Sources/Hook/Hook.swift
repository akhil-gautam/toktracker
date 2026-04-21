import Foundation
import Core
import Storage
import Detection

public struct HookStatus: Sendable, Codable {
    public var installed: Bool
    public var kinds: [String]
    public init(installed: Bool, kinds: [String]) {
        self.installed = installed
        self.kinds = kinds
    }
}

public enum HookInstaller {
    public static let markerKey = "tokscale_macos_managed"
    public static let kinds = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"]

    public static func defaultSettingsURL(global: Bool) -> URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        if global {
            return home.appendingPathComponent(".claude/settings.json")
        }
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        return cwd.appendingPathComponent(".claude/settings.json")
    }

    public static func install(at path: URL, hookBinary: URL) throws {
        let command = "\"\(hookBinary.path)\""
        try backupIfNeeded(at: path)
        var settings = try read(at: path)
        var hooks = settings["hooks"] as? [String: Any] ?? [:]
        for kind in kinds {
            var existing = (hooks[kind] as? [[String: Any]]) ?? []
            existing.removeAll { isManaged($0) }
            var entry: [String: Any] = [
                "hooks": [[
                    "type": "command",
                    "command": "\(command) \(kind)",
                    markerKey: true,
                ]]
            ]
            if kind == "PreToolUse" || kind == "PostToolUse" {
                entry["matcher"] = "*"
            }
            existing.append(entry)
            hooks[kind] = existing
        }
        settings["hooks"] = hooks
        try write(settings, at: path)
    }

    public static func uninstall(at path: URL) throws {
        var settings = try read(at: path)
        guard var hooks = settings["hooks"] as? [String: Any] else { return }
        for kind in kinds {
            var existing = (hooks[kind] as? [[String: Any]]) ?? []
            existing.removeAll { isManaged($0) }
            if existing.isEmpty { hooks.removeValue(forKey: kind) }
            else { hooks[kind] = existing }
        }
        if hooks.isEmpty { settings.removeValue(forKey: "hooks") }
        else { settings["hooks"] = hooks }
        try write(settings, at: path)
    }

    public static func status(at path: URL) -> HookStatus {
        guard let settings = try? read(at: path),
              let hooks = settings["hooks"] as? [String: Any] else {
            return HookStatus(installed: false, kinds: [])
        }
        var present: [String] = []
        for kind in kinds {
            let existing = (hooks[kind] as? [[String: Any]]) ?? []
            if existing.contains(where: isManaged) { present.append(kind) }
        }
        return HookStatus(installed: present.count == kinds.count, kinds: present)
    }

    private static func isManaged(_ entry: [String: Any]) -> Bool {
        let inner = entry["hooks"] as? [[String: Any]] ?? []
        return inner.contains { ($0[markerKey] as? Bool) == true }
    }

    private static func read(at path: URL) throws -> [String: Any] {
        guard FileManager.default.fileExists(atPath: path.path) else { return [:] }
        let data = try Data(contentsOf: path)
        let obj = try JSONSerialization.jsonObject(with: data)
        return (obj as? [String: Any]) ?? [:]
    }

    private static func write(_ settings: [String: Any], at path: URL) throws {
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        let data = try JSONSerialization.data(withJSONObject: settings,
                                              options: [.prettyPrinted, .sortedKeys])
        try data.write(to: path, options: .atomic)
    }

    private static func backupIfNeeded(at path: URL) throws {
        let backup = path.appendingPathExtension("tokscale-bak")
        guard !FileManager.default.fileExists(atPath: backup.path),
              FileManager.default.fileExists(atPath: path.path) else { return }
        try FileManager.default.copyItem(at: path, to: backup)
    }
}

public struct HookExecutor: Sendable {
    public let db: AppDB
    public let registry: RuleRegistry

    public init(db: AppDB, registry: RuleRegistry) {
        self.db = db
        self.registry = registry
    }

    public func run(kind: String, stdin: Data) -> HookDecision {
        let start = Date()
        guard let trigger = Trigger(rawValue: kind) else {
            return HookDecision()
        }
        let payload = (try? JSONSerialization.jsonObject(with: stdin) as? [String: Any]) ?? [:]
        let sessionId = payload["session_id"] as? String
        let toolName = payload["tool_name"] as? String
        let toolInput = (payload["tool_input"] as? [String: Any]).flatMap {
            (try? JSONSerialization.data(withJSONObject: $0))
                .flatMap { String(data: $0, encoding: .utf8) }
        }
        let userPrompt = payload["user_prompt"] as? String ?? payload["prompt"] as? String

        let context = DetectionContext(
            trigger: trigger, db: db, sessionId: sessionId,
            toolName: toolName, toolInput: toolInput,
            userPrompt: userPrompt)
        let runner = DetectionRunner(registry: registry, db: db)
        let decision = runner.run(context: context)

        let latency = Int(Date().timeIntervalSince(start) * 1000)
        let payloadStr = (try? JSONSerialization.data(withJSONObject: payload))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        _ = try? HookEventsRepo(db: db).insert(
            sessionId: sessionId, kind: kind, payloadJSON: payloadStr,
            decision: decision.action.rawValue,
            reason: decision.messages.joined(separator: "\n"),
            latencyMs: latency)
        return decision
    }
}
