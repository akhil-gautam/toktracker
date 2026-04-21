import Foundation
import Core
import Storage
import GRDB
import CryptoKit

private func sha256(_ s: String) -> String {
    Data(SHA256.hash(data: Data(s.utf8))).map { String(format: "%02x", $0) }.joined()
}

// MARK: - A1 Redundant Tool Call

public struct A1RedundantToolCall: Rule {
    public let id = "A1_redundant_tool_call"
    public let category: RuleCategory = .waste
    public let triggers: [Trigger] = [.preToolUse]
    public let defaultSeverity: Severity = .warn
    public let defaultThresholds: [String: Double] = ["min_repeat_count": 2]

    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId,
              let toolName = context.toolName,
              let toolInput = context.toolInput else { return nil }
        let hash = sha256(toolInput)
        let priorCount = (try? context.db.queue.read { db in
            try Int.fetchOne(db, sql: """
                SELECT COUNT(*) FROM tool_calls
                WHERE session_id = ? AND tool_name = ? AND args_hash = ? AND succeeded = 1
                """, arguments: [sessionId, toolName, hash])
        }) ?? 0
        let minRepeat = Int(threshold(context, "min_repeat_count"))
        guard priorCount >= minRepeat - 1, priorCount > 0 else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: .preToolUse,
            severity: .warn,
            summary: "\(toolName) with identical args already succeeded \(priorCount)× this session")
    }
}

// MARK: - A2 Context Bloat

public struct A2ContextBloat: Rule {
    public let id = "A2_context_bloat"
    public let category: RuleCategory = .waste
    public let triggers: [Trigger] = [.userPromptSubmit]
    public let defaultSeverity: Severity = .warn
    public let defaultThresholds: [String: Double] = ["recent_turns": 10, "token_ceiling": 80000]

    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId else { return nil }
        let turns = Int(threshold(context, "recent_turns"))
        let ceiling = Int(threshold(context, "token_ceiling"))
        let tokens = (try? context.db.queue.read { db in
            try Int.fetchOne(db, sql: """
                SELECT COALESCE(SUM(input_tokens + output_tokens), 0) FROM (
                    SELECT input_tokens, output_tokens FROM messages
                    WHERE session_id = ? AND role = 'assistant'
                    ORDER BY turn_index DESC LIMIT ?
                )
                """, arguments: [sessionId, turns])
        }) ?? 0
        guard tokens >= ceiling else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: .userPromptSubmit,
            severity: .warn,
            summary: "last \(turns) turns consumed \(tokens) tokens — consider /compact")
    }
}

// MARK: - A3 Cache-miss Postmortem

public struct A3CacheMissPostmortem: Rule {
    public let id = "A3_cache_miss_postmortem"
    public let category: RuleCategory = .waste
    public let triggers: [Trigger] = [.postToolUse, .stop]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = ["drop_threshold": 0.3]

    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId else { return nil }
        let drop = threshold(context, "drop_threshold")
        let result: (Double, Double)? = (try? context.db.queue.read { db -> (Double, Double)? in
            let row = try Row.fetchOne(db, sql: """
                SELECT
                  COALESCE(SUM(cache_read),0) as cread,
                  COALESCE(SUM(cache_read) + SUM(input_tokens),0) as total
                FROM messages WHERE session_id = ? AND role='assistant'
                """, arguments: [sessionId])
            guard let row else { return nil }
            let cread = Double((row["cread"] as Int?) ?? 0)
            let total = Double((row["total"] as Int?) ?? 0)
            return (cread, total)
        }) ?? nil
        guard let (cread, total) = result, total > 0 else { return nil }
        let ratio = cread / total
        guard ratio < drop else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: context.trigger,
            severity: .info,
            summary: String(format: "cache reuse dropped to %.0f%% this session", ratio * 100))
    }
}

// MARK: - A4 Model Mismatch

public struct A4ModelMismatch: Rule {
    public let id = "A4_model_mismatch"
    public let category: RuleCategory = .waste
    public let triggers: [Trigger] = [.stop, .userPromptSubmit]
    public let defaultSeverity: Severity = .warn
    public let defaultThresholds: [String: Double] = ["trivial_ratio": 0.7]

    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId else { return nil }
        let model: String? = (try? context.db.queue.read { db in
            try String.fetchOne(db,
                sql: "SELECT model FROM sessions WHERE id = ?",
                arguments: [sessionId])
        }) ?? nil
        guard let model, model.lowercased().contains("opus") else { return nil }
        let counts = try? context.db.queue.read { db -> (Int, Int) in
            let total = try Int.fetchOne(db,
                sql: "SELECT COUNT(*) FROM tool_calls WHERE session_id = ?",
                arguments: [sessionId]) ?? 0
            let trivial = try Int.fetchOne(db, sql: """
                SELECT COUNT(*) FROM tool_calls WHERE session_id = ?
                  AND tool_name IN ('Read','Grep','Glob','LS','Bash')
                """, arguments: [sessionId]) ?? 0
            return (total, trivial)
        }
        guard let (total, trivial) = counts, total >= 10 else { return nil }
        let ratio = Double(trivial) / Double(total)
        guard ratio >= threshold(context, "trivial_ratio") else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: context.trigger,
            severity: .warn,
            summary: String(format: "%.0f%% of Opus calls were trivial tool usage — Sonnet would suffice", ratio * 100))
    }
}

// MARK: - A5 Retry Failure Waste

public struct A5RetryFailureWaste: Rule {
    public let id = "A5_retry_failure_waste"
    public let category: RuleCategory = .waste
    public let triggers: [Trigger] = [.postToolUse, .stop]
    public let defaultSeverity: Severity = .warn
    public let defaultThresholds: [String: Double] = ["min_failed_calls": 3, "tokens_floor": 500]

    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId else { return nil }
        let minFailed = Int(threshold(context, "min_failed_calls"))
        let floor = Int(threshold(context, "tokens_floor"))
        let result: (Int, Int)? = (try? context.db.queue.read { db -> (Int, Int)? in
            let row = try Row.fetchOne(db, sql: """
                SELECT COUNT(*) as c, COALESCE(SUM(tokens_returned),0) as t
                FROM tool_calls WHERE session_id = ? AND succeeded = 0
                """, arguments: [sessionId])
            guard let row else { return nil }
            return ((row["c"] as Int?) ?? 0, (row["t"] as Int?) ?? 0)
        }) ?? nil
        guard let (failed, tokens) = result,
              failed >= minFailed, tokens >= floor else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: context.trigger,
            severity: .warn,
            summary: "spent \(tokens) tokens on \(failed) failed tool calls this session")
    }
}

// MARK: - B6–B9 stubs (require embeddings / cross-session analysis — scaffolded)

public struct B6RepeatQuestion: Rule {
    public let id = "B6_repeat_question"
    public let category: RuleCategory = .patterns
    public let triggers: [Trigger] = [.userPromptSubmit, .nightly]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = ["min_count": 3, "window_days": 90]
    public init() {}
    public func evaluate(context: DetectionContext) -> Detection? {
        let minCount = Int(threshold(context, "min_count"))
        let windowMs = Int(threshold(context, "window_days")) * 86_400_000
        let cutoff = Int(Date().timeIntervalSince1970 * 1000) - windowMs
        let rows: [(String, Int)] = (try? context.db.queue.read { db -> [(String, Int)] in
            let dbRows = try Row.fetchAll(db, sql: """
                SELECT content_hash, COUNT(*) as c FROM messages
                WHERE role='user' AND created_at >= ?
                GROUP BY content_hash
                HAVING c >= ?
                ORDER BY c DESC LIMIT 5
                """, arguments: [cutoff, minCount])
            return dbRows.compactMap { row in
                guard let h: String = row["content_hash"], let c: Int = row["c"] else { return nil }
                return (h, c)
            }
        }) ?? []
        guard let top = rows.first else { return nil }
        return Detection(
            ruleId: id, sessionId: context.sessionId, trigger: context.trigger,
            severity: .info,
            summary: "same question asked \(top.1)× in the last 90 days — consider documenting in CLAUDE.md")
    }
}

public struct B7CorrectionGraph: Rule {
    public let id = "B7_correction_graph"
    public let category: RuleCategory = .patterns
    public let triggers: [Trigger] = [.stop, .nightly]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = [
        "min_count": 3,
        "min_sessions": 2,
        "window_days": 30,
    ]
    public init() {}

    /// Opens with a correction cue. We take the first clause (up to the first
    /// punctuation) so "don't mock the db, it hides migration bugs" is
    /// normalized to "don't mock the db".
    private static let cues: [String] = [
        "don't ", "do not ", "stop ", "no, ", "no.", "not that",
        "i said ", "we don't ", "we do not ", "please don't ", "actually, ",
    ]

    public func evaluate(context: DetectionContext) -> Detection? {
        let minCount = Int(threshold(context, "min_count"))
        let minSessions = Int(threshold(context, "min_sessions"))
        let windowMs = Int(threshold(context, "window_days")) * 86_400_000
        let cutoff = Int(Date().timeIntervalSince1970 * 1000) - windowMs

        let rows: [(sessionId: String, content: String)] = (try? context.db.queue.read { db in
            try Row.fetchAll(db, sql: """
                SELECT session_id, content_redacted FROM messages
                WHERE role = 'user' AND created_at >= ?
                """, arguments: [cutoff])
                .compactMap { row in
                    guard let sid: String = row["session_id"],
                          let c: String = row["content_redacted"] else { return nil }
                    return (sid, c)
                }
        }) ?? []

        var phraseCounts: [String: Int] = [:]
        var phraseSessions: [String: Set<String>] = [:]
        for row in rows {
            guard let phrase = Self.extractCorrection(in: row.content) else { continue }
            phraseCounts[phrase, default: 0] += 1
            phraseSessions[phrase, default: []].insert(row.sessionId)
        }

        let candidates = phraseCounts
            .filter { $0.value >= minCount && (phraseSessions[$0.key]?.count ?? 0) >= minSessions }
            .sorted { $0.value > $1.value }
        guard let top = candidates.first else { return nil }
        let sessions = phraseSessions[top.key]?.count ?? 0
        return Detection(
            ruleId: id, sessionId: context.sessionId, trigger: context.trigger,
            severity: .info,
            summary: "\"\(top.key)…\" said \(top.value)× across \(sessions) sessions — consider adding to CLAUDE.md")
    }

    /// Returns the first-clause correction phrase, or nil if no correction cue
    /// is present. Keeps phrases short (≤ 48 chars) so the detection summary
    /// stays readable and the CLAUDE.md entry doesn't become a paragraph.
    static func extractCorrection(in content: String) -> String? {
        let lower = content.lowercased()
        var hitRange: Range<String.Index>? = nil
        for cue in cues {
            if let r = lower.range(of: cue) {
                if hitRange == nil || r.lowerBound < hitRange!.lowerBound {
                    hitRange = r
                }
            }
        }
        guard let start = hitRange?.lowerBound else { return nil }
        let tail = lower[start...]
        let stops: Set<Character> = [".", "!", "?", "\n", ",", ";"]
        var end = tail.endIndex
        for (i, ch) in tail.enumerated() where i > 0 && stops.contains(ch) {
            end = tail.index(tail.startIndex, offsetBy: i)
            break
        }
        var phrase = String(tail[..<end]).trimmingCharacters(in: .whitespaces)
        if phrase.count > 48 { phrase = String(phrase.prefix(48)) }
        return phrase.isEmpty ? nil : phrase
    }
}

public struct B8FileReopen: Rule {
    public let id = "B8_file_reopen"
    public let category: RuleCategory = .patterns
    public let triggers: [Trigger] = [.postToolUse]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = ["min_sessions": 3]
    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId,
              let toolName = context.toolName,
              ["Read", "Write", "Edit"].contains(toolName),
              let input = context.toolInput,
              let data = input.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let path = (obj["file_path"] as? String) ?? (obj["path"] as? String) else { return nil }
        let minSessions = Int(threshold(context, "min_sessions"))
        let distinct = (try? context.db.queue.read { db in
            try Int.fetchOne(db, sql: """
                SELECT COUNT(DISTINCT session_id) FROM tool_calls
                WHERE target_path = ? AND session_id != ?
                """, arguments: [path, sessionId])
        }) ?? 0
        guard distinct >= minSessions - 1 else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: .postToolUse,
            severity: .info,
            summary: "\(path) opened across \(distinct + 1) sessions — consider noting in CLAUDE.md")
    }
}

public struct B9PromptPattern: Rule {
    public let id = "B9_prompt_pattern"
    public let category: RuleCategory = .patterns
    public let triggers: [Trigger] = [.stop, .nightly]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = ["min_count": 3, "window_days": 30]
    public init() {}
    public func evaluate(context: DetectionContext) -> Detection? {
        let minCount = Int(threshold(context, "min_count"))
        let windowMs = Int(threshold(context, "window_days")) * 86_400_000
        let cutoff = Int(Date().timeIntervalSince1970 * 1000) - windowMs
        let prompts: [String] = (try? context.db.queue.read { db in
            try String.fetchAll(db, sql: """
                SELECT content_redacted FROM messages
                WHERE role='user' AND created_at >= ?
                """, arguments: [cutoff])
        }) ?? []
        var prefixCounts: [String: Int] = [:]
        for prompt in prompts {
            let tokens = prompt
                .lowercased()
                .components(separatedBy: CharacterSet.alphanumerics.inverted)
                .filter { !$0.isEmpty }
            guard tokens.count >= 5 else { continue }
            let prefix = tokens.prefix(5).joined(separator: " ")
            prefixCounts[prefix, default: 0] += 1
        }
        guard let top = prefixCounts.max(by: { $0.value < $1.value }),
              top.value >= minCount else { return nil }
        return Detection(
            ruleId: id, sessionId: context.sessionId, trigger: context.trigger,
            severity: .info,
            summary: "\"\(top.key)…\" used \(top.value)× — consider a slash command")
    }
}

// MARK: - C10 Context Window ETA

public struct C10ContextWindowETA: Rule {
    public let id = "C10_context_window_eta"
    public let category: RuleCategory = .forecast
    public let triggers: [Trigger] = [.userPromptSubmit]
    public let defaultSeverity: Severity = .warn
    public let defaultThresholds: [String: Double] = ["min_remaining_turns": 5, "context_window": 200000]
    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId else { return nil }
        let cw = Int(threshold(context, "context_window"))
        let minTurns = threshold(context, "min_remaining_turns")
        let row: Row? = (try? context.db.queue.read { db in
            try Row.fetchOne(db, sql: """
                SELECT COALESCE(MAX(input_tokens + cache_read + cache_write),0) as peak,
                       COALESCE(AVG(input_tokens + output_tokens),0) as avg
                FROM messages WHERE session_id = ? AND role = 'assistant'
                """, arguments: [sessionId])
        }) ?? nil
        guard let row,
              let peak = row["peak"] as Int?,
              let avgTokens = row["avg"] as Double? else { return nil }
        guard avgTokens > 0 else { return nil }
        let remaining = Double(cw - peak)
        let remainingTurns = remaining / avgTokens
        guard remainingTurns <= minTurns, remainingTurns > 0 else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: .userPromptSubmit,
            severity: .warn,
            summary: String(format: "~%.0f turns until context window exhausted", remainingTurns))
    }
}

// MARK: - C11 Preflight Cost

public struct C11PreflightCost: Rule {
    public let id = "C11_preflight_cost"
    public let category: RuleCategory = .forecast
    public let triggers: [Trigger] = [.userPromptSubmit]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = ["min_cost_cents": 1]
    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId,
              let prompt = context.userPrompt else { return nil }
        let session: String? = (try? context.db.queue.read { db in
            try String.fetchOne(db, sql: "SELECT model FROM sessions WHERE id = ?",
                arguments: [sessionId])
        }) ?? nil
        guard let model = session else { return nil }
        let avg: Row? = (try? context.db.queue.read { db in
            try Row.fetchOne(db, sql: """
                SELECT COALESCE(AVG(input_tokens),0) as ai,
                       COALESCE(AVG(output_tokens),0) as ao
                FROM messages WHERE session_id = ? AND role = 'assistant'
                """, arguments: [sessionId])
        }) ?? nil
        let ai = (avg?["ai"] as Double?) ?? 0
        let ao = (avg?["ao"] as Double?) ?? 0
        let promptTokens = Double(prompt.count / 4)
        let estIn = (promptTokens + ai)
        let estOut = ao
        let cost = CostCalculator.shared.cost(
            model: model, inputTokens: Int(estIn), outputTokens: Int(estOut))
        let cents = cost / 1_000
        guard cents >= Int(threshold(context, "min_cost_cents")) else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: .userPromptSubmit,
            severity: .info,
            summary: String(format: "estimated turn cost: ~$%.2f", Double(cents) / 100))
    }
}

// MARK: - C12 Runaway Killswitch

public struct C12RunawayKillswitch: Rule {
    public let id = "C12_runaway_killswitch"
    public let category: RuleCategory = .forecast
    public let triggers: [Trigger] = [.preToolUse]
    public let defaultSeverity: Severity = .block
    public let defaultThresholds: [String: Double] = ["ceiling_cents": 2000]
    public init() {}

    public func evaluate(context: DetectionContext) -> Detection? {
        guard let sessionId = context.sessionId else { return nil }
        let ceiling = threshold(context, "ceiling_cents")
        let mc = (try? context.db.queue.read { db in
            try Int.fetchOne(db,
                sql: "SELECT cost_millicents FROM sessions WHERE id = ?",
                arguments: [sessionId])
        }) ?? 0
        let cents = Double(mc) / 1_000
        guard cents >= ceiling else { return nil }
        return Detection(
            ruleId: id, sessionId: sessionId, trigger: .preToolUse,
            severity: .block,
            summary: String(format: "session cost $%.2f exceeds ceiling $%.2f", cents / 100, ceiling / 100))
    }
}

// MARK: - D13 & D14 stubs

public struct D13CostPerPR: Rule {
    public let id = "D13_cost_per_pr"
    public let category: RuleCategory = .attribution
    public let triggers: [Trigger] = [.gitEvent, .nightly]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = [:]
    public init() {}
    public func evaluate(context: DetectionContext) -> Detection? {
        struct Row2 { let pr: Int; let repo: String; let cost: Int }
        let row: Row2? = (try? context.db.queue.read { db -> Row2? in
            let r = try Row.fetchOne(db, sql: """
                SELECT pa.pr_number, pa.repo, COALESCE(SUM(s.cost_millicents),0) as cost
                FROM pr_attributions pa JOIN sessions s ON s.id = pa.session_id
                GROUP BY pa.pr_number, pa.repo
                ORDER BY MAX(s.started_at) DESC LIMIT 1
                """)
            guard let r, let pr: Int = r["pr_number"],
                  let repo: String = r["repo"],
                  let cost: Int = r["cost"] else { return nil }
            return Row2(pr: pr, repo: repo, cost: cost)
        }) ?? nil
        guard let row, row.cost > 0 else { return nil }
        return Detection(
            ruleId: id, sessionId: context.sessionId, trigger: context.trigger,
            severity: .info,
            summary: "PR #\(row.pr) in \(row.repo) cost \(String(format: "$%.2f", Double(row.cost) / 100_000))")
    }
}

public struct D14AbandonedSession: Rule {
    public let id = "D14_abandoned_session"
    public let category: RuleCategory = .attribution
    public let triggers: [Trigger] = [.nightly]
    public let defaultSeverity: Severity = .info
    public let defaultThresholds: [String: Double] = ["min_age_days": 14, "min_cost_cents": 100]
    public init() {}
    public func evaluate(context: DetectionContext) -> Detection? {
        let minAgeMs = Int(threshold(context, "min_age_days")) * 86_400_000
        let minCostMc = Int(threshold(context, "min_cost_cents")) * 1000
        let cutoff = Int(Date().timeIntervalSince1970 * 1000) - minAgeMs
        struct Agg { let count: Int; let cost: Int }
        let agg: Agg? = (try? context.db.queue.read { db -> Agg? in
            let r = try Row.fetchOne(db, sql: """
                SELECT COUNT(*) as c, COALESCE(SUM(cost_millicents),0) as cost
                FROM sessions s WHERE s.started_at < ? AND s.cost_millicents >= ?
                  AND NOT EXISTS (SELECT 1 FROM pr_attributions pa WHERE pa.session_id = s.id)
                """, arguments: [cutoff, minCostMc])
            guard let r, let c: Int = r["c"], let cost: Int = r["cost"], c > 0 else { return nil }
            return Agg(count: c, cost: cost)
        }) ?? nil
        guard let agg else { return nil }
        return Detection(
            ruleId: id, sessionId: context.sessionId, trigger: context.trigger,
            severity: .info,
            summary: "\(agg.count) sessions older than \(Int(threshold(context, "min_age_days"))) days with no PR — total \(String(format: "$%.2f", Double(agg.cost) / 100_000))")
    }
}
