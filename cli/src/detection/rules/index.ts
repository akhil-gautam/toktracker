import type { RuleRegistry } from '../registry.js'
import { a1RedundantToolCall } from './a1-redundant-tool-call.js'
import { a5RetryFailureWaste } from './a5-retry-failure-waste.js'

export function registerAllRules(registry: RuleRegistry): void {
  registry.register(a1RedundantToolCall)
  registry.register(a5RetryFailureWaste)
}
