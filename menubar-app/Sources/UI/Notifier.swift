import Foundation
import UserNotifications
import Core

public final class Notifier: @unchecked Sendable {
    public static let shared = Notifier()

    private var cooldown: [String: Date] = [:]
    private let lock = NSLock()
    private let cooldownInterval: TimeInterval = 3600  // 1 hour per key

    public func requestAuthorizationIfNeeded() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    public func post(key: String, title: String, body: String) {
        guard allow(key) else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let request = UNNotificationRequest(
            identifier: key + "-" + UUID().uuidString,
            content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    public func scanForBreaches(aggregates: SessionStore.Aggregates, budgets: [Budget]) {
        for budget in budgets {
            // Approximate: daily budget vs today's cost.
            // (True per-budget spend comes from BudgetCalculator; here we use the already-aggregated today total for the global case.)
            guard budget.scope == .global, budget.period == .daily else { continue }
            let spend = aggregates.todayDetail.costMillicents
            let limit = budget.limitCents * 1_000  // cents → millicents
            guard limit > 0 else { continue }
            let pct = Int(Double(spend) / Double(limit) * 100)
            if pct >= budget.alertAtPct {
                post(
                    key: "budget-\(budget.id)-\(pct / 10 * 10)",
                    title: "Budget \(pct)% used",
                    body: "Today's spend " + Formatters.cost(millicents: spend) +
                          " of " + String(format: "$%.2f", Double(budget.limitCents) / 100))
            }
        }
    }

    public func postKillswitch(sessionId: String, cents: Int, ceiling: Int) {
        post(
            key: "killswitch-\(sessionId)",
            title: "Toktracker killswitch hit",
            body: "Session cost $\(cents / 100) exceeds ceiling $\(ceiling / 100)")
    }

    private func allow(_ key: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let now = Date()
        if let last = cooldown[key], now.timeIntervalSince(last) < cooldownInterval {
            return false
        }
        cooldown[key] = now
        return true
    }
}
