import Foundation
import GRDB
import Core

public struct BudgetsRepo: Sendable {
    public let db: AppDB
    public init(db: AppDB) { self.db = db }

    public func ensureSchema() throws {
        try db.queue.write { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS budgets (
                    id TEXT PRIMARY KEY,
                    scope TEXT NOT NULL,
                    scope_value TEXT,
                    period TEXT NOT NULL,
                    limit_cents INTEGER NOT NULL,
                    alert_at_pct INTEGER NOT NULL DEFAULT 80,
                    created_at INTEGER NOT NULL
                )
                """)
        }
    }

    public func all() throws -> [Budget] {
        try db.queue.read { db in
            try Row.fetchAll(db, sql: "SELECT * FROM budgets ORDER BY created_at DESC").compactMap { row in
                guard let id: String = row["id"],
                      let scopeRaw: String = row["scope"],
                      let scope = BudgetScope(rawValue: scopeRaw),
                      let periodRaw: String = row["period"],
                      let period = BudgetPeriod(rawValue: periodRaw),
                      let limit: Int = row["limit_cents"],
                      let pct: Int = row["alert_at_pct"] else { return nil }
                return Budget(id: id, scope: scope, scopeValue: row["scope_value"],
                             period: period, limitCents: limit, alertAtPct: pct)
            }
        }
    }

    public func upsert(_ budget: Budget) throws {
        try db.queue.write { db in
            try db.execute(sql: """
                INSERT INTO budgets (id, scope, scope_value, period, limit_cents, alert_at_pct, created_at)
                VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                  scope=excluded.scope,
                  scope_value=excluded.scope_value,
                  period=excluded.period,
                  limit_cents=excluded.limit_cents,
                  alert_at_pct=excluded.alert_at_pct
                """,
                arguments: [
                    budget.id, budget.scope.rawValue, budget.scopeValue,
                    budget.period.rawValue, budget.limitCents, budget.alertAtPct,
                    Int(Date().timeIntervalSince1970 * 1000),
                ])
        }
    }

    public func delete(id: String) throws {
        try db.queue.write { db in
            try db.execute(sql: "DELETE FROM budgets WHERE id = ?", arguments: [id])
        }
    }
}

public enum BudgetCalculator {
    /// Compute cost across the budget's period.
    public static func spend(budget: Budget, db: AppDB) -> Int {
        let (start, end) = period(for: budget.period)
        let scopeClause = scopeFilter(budget)
        let sql = """
            SELECT COALESCE(SUM(cost_millicents), 0) FROM sessions
            WHERE started_at >= ? AND started_at < ?\(scopeClause.sql)
            """
        let args: [any DatabaseValueConvertible] = [start, end] + scopeClause.args
        return (try? db.queue.read { db in
            try Int.fetchOne(db, sql: sql, arguments: StatementArguments(args)) ?? 0
        }) ?? 0
    }

    private static func period(for period: BudgetPeriod) -> (Int, Int) {
        let cal = Calendar.current
        let now = Date()
        let startDay = cal.startOfDay(for: now)
        let endMs = Int(now.timeIntervalSince1970 * 1000) + 86_400_000
        let start: Date
        switch period {
        case .daily: start = startDay
        case .weekly: start = cal.date(byAdding: .day, value: -7, to: startDay) ?? startDay
        case .monthly: start = cal.date(byAdding: .day, value: -30, to: startDay) ?? startDay
        }
        return (Int(start.timeIntervalSince1970 * 1000), endMs)
    }

    private static func scopeFilter(_ budget: Budget) -> (sql: String, args: [any DatabaseValueConvertible]) {
        switch budget.scope {
        case .global: return ("", [])
        case .project:
            return (" AND cwd LIKE ?", [(budget.scopeValue ?? "") + "%"])
        case .repo:
            return (" AND git_repo = ?", [budget.scopeValue ?? ""])
        }
    }
}
