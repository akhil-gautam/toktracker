import type { RuleRegistry } from '../registry.js'
import { a1RedundantToolCall } from './a1-redundant-tool-call.js'

export function registerAllRules(registry: RuleRegistry): void {
  registry.register(a1RedundantToolCall)
}
