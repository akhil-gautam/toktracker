import SwiftUI
import AppKit
import UI

@main
struct TokscaleApp: App {
    @State private var store = AppStore()

    init() {
        NSApplication.shared.setActivationPolicy(.accessory)
    }

    var body: some Scene {
        MenuBarExtra {
            MenuBarPanel()
                .environment(store)
                .task { await store.bootstrap() }
        } label: {
            MenuBarLabel()
                .environment(store)
        }
        .menuBarExtraStyle(.window)

        Window("Tokscale", id: "dashboard") {
            DashboardWindow()
                .environment(store)
                .frame(minWidth: 1100, minHeight: 720)
                .onAppear {
                    NSApplication.shared.setActivationPolicy(.regular)
                    NSApplication.shared.activate(ignoringOtherApps: true)
                }
                .onDisappear {
                    NSApplication.shared.setActivationPolicy(.accessory)
                }
        }

        Settings {
            PreferencesWindow()
                .environment(store)
        }
    }
}
