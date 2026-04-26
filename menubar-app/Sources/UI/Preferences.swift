import SwiftUI
import ServiceManagement
import Core
import Storage
import Capture
import Hook

public struct PreferencesWindow: View {
    public init() {}
    public var body: some View {
        TabView {
            GeneralPane()
                .tabItem { Label("General", systemImage: "gear") }
            RedactionPane()
                .tabItem { Label("Redaction", systemImage: "eye.slash") }
            BudgetsPane()
                .tabItem { Label("Budgets", systemImage: "dollarsign.circle") }
            HookPane()
                .tabItem { Label("Claude Code Hook", systemImage: "link") }
        }
        .padding(20)
        .frame(width: 560, height: 460)
    }
}

struct GeneralPane: View {
    @State private var launchAtLogin = SMAppService.mainApp.status == .enabled
    @State private var status: String = ""

    var body: some View {
        Form {
            Toggle("Launch at login", isOn: Binding(
                get: { launchAtLogin },
                set: { newValue in
                    launchAtLogin = newValue
                    toggle(newValue)
                }))
            Text("Toktracker needs permission to send notifications. Grant it in System Settings → Notifications if alerts aren't appearing.")
                .font(.caption).foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Request notification authorization") {
                Notifier.shared.requestAuthorizationIfNeeded()
            }
            if !status.isEmpty { Text(status).font(.caption).foregroundStyle(.blue) }
        }
    }

    private func toggle(_ enable: Bool) {
        do {
            if enable { try SMAppService.mainApp.register() }
            else { try SMAppService.mainApp.unregister() }
            status = enable ? "Registered launch-at-login" : "Unregistered"
        } catch {
            status = "Failed: \(error.localizedDescription)"
        }
    }
}

struct RedactionPane: View {
    @Environment(AppStore.self) private var store
    @State private var rules: [RedactionRule] = []
    @State private var newPattern: String = ""
    @State private var newReplacement: String = "[REDACTED]"

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Regex rules applied to message + tool-call content before persistence.")
                .font(.caption).foregroundStyle(.secondary)

            List($rules, id: \.id) { $rule in
                HStack {
                    Toggle("", isOn: $rule.enabled)
                        .labelsHidden()
                        .onChange(of: rule.enabled) { _, newValue in
                            if let id = rule.id, let db = store.db {
                                try? RedactionRulesRepo(db: db).setEnabled(id: id, enabled: newValue)
                            }
                        }
                    VStack(alignment: .leading) {
                        Text(rule.pattern).font(.body.monospaced())
                        Text("→ \(rule.replacement)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if rule.builtin {
                        Text("builtin").font(.caption).padding(.horizontal, 6)
                            .background(Color.secondary.opacity(0.2))
                            .clipShape(Capsule())
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(minHeight: 240)

            Divider()
            HStack {
                TextField("Pattern (regex)", text: $newPattern)
                TextField("Replacement", text: $newReplacement)
                    .frame(width: 120)
                Button("Add") { addRule() }.disabled(newPattern.isEmpty)
            }
        }
        .onAppear(perform: load)
    }

    private func load() {
        guard let db = store.db else { return }
        rules = (try? RedactionRulesRepo(db: db).all()) ?? []
    }

    private func addRule() {
        guard let db = store.db, !newPattern.isEmpty else { return }
        let rule = RedactionRule(pattern: newPattern, replacement: newReplacement, enabled: true, builtin: false)
        try? RedactionRulesRepo(db: db).insert(rule)
        newPattern = ""
        load()
    }
}

struct BudgetsPane: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Manage budgets in the Budgets tab of the dashboard.")
                .foregroundStyle(.secondary)
            List(store.budgets) { b in
                HStack {
                    Text("\(b.scope.rawValue)/\(b.period.rawValue)")
                    if let v = b.scopeValue { Text(v).font(.caption.monospaced()) }
                    Spacer()
                    Text("$\(b.limitCents / 100) @ \(b.alertAtPct)%")
                }
            }
        }
    }
}

struct HookPane: View {
    @Environment(AppStore.self) private var store
    @State private var message: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: store.hookStatus.installed ? "checkmark.seal.fill" : "exclamationmark.triangle")
                    .foregroundStyle(store.hookStatus.installed ? .green : .orange)
                Text(store.hookStatus.installed ? "Hook installed" : "Hook not installed")
                    .font(.headline)
            }
            if !store.hookStatus.kinds.isEmpty {
                Text("Active kinds: " + store.hookStatus.kinds.joined(separator: ", "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            HStack {
                Button("Install") { install() }
                Button("Uninstall") { uninstall() }
                Button("Refresh") { store.refreshHookStatus() }
            }
            if let message { Text(message).font(.caption).foregroundStyle(.blue) }
            Spacer()
        }
        .onAppear { store.refreshHookStatus() }
    }

    private var settingsURL: URL { HookInstaller.defaultSettingsURL(global: true) }
    private var hookBinary: URL {
        Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/toktracker-hook")
    }

    private func install() {
        do {
            try HookInstaller.install(at: settingsURL, hookBinary: hookBinary)
            message = "Installed"
        } catch { message = "Error: \(error.localizedDescription)" }
        store.refreshHookStatus()
    }

    private func uninstall() {
        do {
            try HookInstaller.uninstall(at: settingsURL)
            message = "Uninstalled"
        } catch { message = "Error: \(error.localizedDescription)" }
        store.refreshHookStatus()
    }
}
