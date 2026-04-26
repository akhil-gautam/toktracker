import Foundation
import Core
import Storage
import Detection
import Hook

@main
struct ToktrackerHookMain {
    static func main() async {
        let args = CommandLine.arguments
        let kind = args.count > 1 ? args[1] : "Stop"
        let stdin = FileHandle.standardInput.readDataToEndOfFile()

        do {
            let db = try Boot.open()
            let registry = RuleRegistryFactory.allRules()
            let executor = HookExecutor(db: db, registry: registry)
            let decision = executor.run(kind: kind, stdin: stdin)

            if decision.action == .block {
                let payload: [String: Any] = [
                    "decision": "block",
                    "reason": decision.messages.joined(separator: "\n"),
                ]
                if let data = try? JSONSerialization.data(withJSONObject: payload) {
                    FileHandle.standardOutput.write(data)
                }
                exit(2)
            }
            exit(0)
        } catch {
            FileHandle.standardError.write(Data("toktracker-hook: \(error)\n".utf8))
            exit(0)
        }
    }
}
