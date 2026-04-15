import type Database from 'better-sqlite3'
import { DetectionsRepo } from '../db/repository.js'
import { RuleRegistry } from './registry.js'
import { ThresholdLoader } from './thresholds.js'
import type { Detection, DetectionContext, HookDecision, Rule, Severity } from './types.js'

export interface RunResult {
  detections: Detection[]
  decision: HookDecision
  latencyMs: number
}

export interface RunnerOptions {
  budgetMs?: number
}

const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warn: 1, block: 2 }

export class DetectionRunner {
  private budgetMs: number
  constructor(
    private db: Database.Database,
    private registry: RuleRegistry,
    private thresholds: ThresholdLoader,
    opts: RunnerOptions = {},
  ) {
    this.budgetMs = opts.budgetMs ?? 200
  }

  async run(ctx: DetectionContext): Promise<RunResult> {
    const started = Date.now()
    const rules = this.registry.byTrigger(ctx.trigger)
    const detections: Detection[] = []
    const detectionsRepo = new DetectionsRepo(this.db)

    for (const rule of rules) {
      const t = this.thresholds.load(rule.id, rule.defaultThresholds)
      if (!t.enabled) continue
      if (Date.now() - started >= this.budgetMs) break

      const ruleCtx: DetectionContext = {
        ...ctx,
        thresholds: t.thresholds,
        hardBlockEnabled: ctx.hardBlockEnabled && rule.hardBlockEligible && t.hardBlock,
      }
      const det = await this.evaluateSafe(rule, ruleCtx)
      if (!det) continue
      detections.push(det)
      detectionsRepo.insert({
        sessionId: ctx.sessionId ?? null,
        ruleId: det.ruleId,
        severity: det.severity,
        summary: det.summary,
        metadataJson: det.metadata ? JSON.stringify(det.metadata) : null,
        suggestedActionJson: det.suggestedAction ? JSON.stringify(det.suggestedAction) : null,
        createdAt: ctx.now(),
      })
    }

    const decision = this.aggregate(detections, ctx.hardBlockEnabled)
    const latencyMs = Date.now() - started
    return { detections, decision, latencyMs }
  }

  private async evaluateSafe(rule: Rule, ctx: DetectionContext): Promise<Detection | null> {
    try {
      const out = await Promise.race([
        Promise.resolve(rule.evaluate(ctx)),
        new Promise<null>(res => setTimeout(() => res(null), this.budgetMs)),
      ])
      return out ?? null
    } catch {
      return null
    }
  }

  private aggregate(detections: Detection[], hardBlockAllowed: boolean): HookDecision {
    let top: Detection | null = null
    for (const d of detections) {
      const effective = hardBlockAllowed && d.severity === 'warn' ? 'block' : d.severity
      if (!top || SEVERITY_ORDER[effective] > SEVERITY_ORDER[top.severity]) {
        top = { ...d, severity: effective }
      }
    }
    if (!top) return {}
    if (top.severity === 'block') {
      return { decision: 'block', reason: `tokscale: ${top.summary}` }
    }
    return { additionalContext: detections.map(d => `tokscale: ${d.summary}`).join('\n') }
  }
}
