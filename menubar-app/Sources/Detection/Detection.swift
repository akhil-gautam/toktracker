import Foundation
import Core
import Storage
import GRDB

public struct DetectionContext: Sendable {
    public let trigger: Trigger
    public let db: AppDB
    public let sessionId: String?
    public let toolName: String?
    public let toolInput: String?
    public let userPrompt: String?
    public let thresholds: [String: Double]

    public init(trigger: Trigger, db: AppDB, sessionId: String? = nil,
                toolName: String? = nil, toolInput: String? = nil,
                userPrompt: String? = nil, thresholds: [String: Double] = [:]) {
        self.trigger = trigger
        self.db = db
        self.sessionId = sessionId
        self.toolName = toolName
        self.toolInput = toolInput
        self.userPrompt = userPrompt
        self.thresholds = thresholds
    }
}

public protocol Rule: Sendable {
    var id: String { get }
    var category: RuleCategory { get }
    var triggers: [Trigger] { get }
    var defaultSeverity: Severity { get }
    var defaultThresholds: [String: Double] { get }
    func evaluate(context: DetectionContext) -> Detection?
}

public extension Rule {
    func threshold(_ context: DetectionContext, _ key: String) -> Double {
        context.thresholds[key] ?? defaultThresholds[key] ?? 0
    }
}

public final class RuleRegistry: @unchecked Sendable {
    public private(set) var rules: [String: any Rule] = [:]
    public init() {}

    public func register(_ rule: any Rule) {
        rules[rule.id] = rule
    }

    public func rules(for trigger: Trigger) -> [any Rule] {
        rules.values.filter { $0.triggers.contains(trigger) }
    }
}

public struct DetectionRunner: Sendable {
    public let registry: RuleRegistry
    public let detections: DetectionsRepo

    public init(registry: RuleRegistry, db: AppDB) {
        self.registry = registry
        self.detections = DetectionsRepo(db: db)
    }

    public func run(context: DetectionContext) -> HookDecision {
        var decision = HookDecision()
        for rule in registry.rules(for: context.trigger) {
            guard let det = rule.evaluate(context: context) else { continue }
            _ = try? detections.insert(det)
            decision.messages.append("[\(det.ruleId)] \(det.summary)")
            switch det.severity {
            case .block: decision.action = .block
            case .warn where decision.action == .allow: decision.action = .warn
            default: break
            }
        }
        return decision
    }
}

public enum RuleRegistryFactory {
    public static func allRules() -> RuleRegistry {
        let registry = RuleRegistry()
        registry.register(A1RedundantToolCall())
        registry.register(A2ContextBloat())
        registry.register(A3CacheMissPostmortem())
        registry.register(A4ModelMismatch())
        registry.register(A5RetryFailureWaste())
        registry.register(B6RepeatQuestion())
        registry.register(B7CorrectionGraph())
        registry.register(B8FileReopen())
        registry.register(B9PromptPattern())
        registry.register(C10ContextWindowETA())
        registry.register(C11PreflightCost())
        registry.register(C12RunawayKillswitch())
        registry.register(D13CostPerPR())
        registry.register(D14AbandonedSession())
        return registry
    }
}
