import type { RuleRegistry } from '../registry.js'
import { a1RedundantToolCall } from './a1-redundant-tool-call.js'
import { a2ContextBloat } from './a2-context-bloat.js'
import { a3CacheMissPostmortem } from './a3-cache-miss-postmortem.js'
import { a4ModelMismatch } from './a4-model-mismatch.js'
import { a5RetryFailureWaste } from './a5-retry-failure-waste.js'
import { b6RepeatQuestion } from './b6-repeat-question.js'
import { b7CorrectionGraph } from './b7-correction-graph.js'
import { b8FileReopen } from './b8-file-reopen.js'
import { c10ContextWindowEta } from './c10-context-window-eta.js'
import { c11PreflightCost } from './c11-preflight-cost.js'
import { c12RunawayKillswitch } from './c12-runaway-killswitch.js'

export function registerAllRules(registry: RuleRegistry): void {
  registry.register(a1RedundantToolCall)
  registry.register(a2ContextBloat)
  registry.register(a3CacheMissPostmortem)
  registry.register(a4ModelMismatch)
  registry.register(a5RetryFailureWaste)
  registry.register(b6RepeatQuestion)
  registry.register(b7CorrectionGraph)
  registry.register(b8FileReopen)
  registry.register(c10ContextWindowEta)
  registry.register(c11PreflightCost)
  registry.register(c12RunawayKillswitch)
}
