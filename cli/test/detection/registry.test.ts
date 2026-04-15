import { describe, it, expect, beforeEach } from 'vitest'
import { RuleRegistry } from '../../src/detection/registry.js'
import type { Rule } from '../../src/detection/types.js'

const sampleA: Rule = {
  id: 'A1_redundant_tool_call', category: 'A',
  triggers: ['PreToolUse'], defaultSeverity: 'warn', hardBlockEligible: true,
  defaultThresholds: { min_repeat_count: 2 },
  evaluate: () => null,
}
const sampleB: Rule = {
  id: 'B6_repeat_question', category: 'B',
  triggers: ['UserPromptSubmit', 'Nightly'], defaultSeverity: 'info', hardBlockEligible: false,
  defaultThresholds: { min_matches: 3 },
  evaluate: () => null,
}

describe('RuleRegistry', () => {
  let reg: RuleRegistry
  beforeEach(() => { reg = new RuleRegistry(); reg.register(sampleA); reg.register(sampleB) })

  it('lists rules by category', () => {
    expect(reg.byCategory('A')).toHaveLength(1)
    expect(reg.byCategory('B')).toHaveLength(1)
  })
  it('resolves rules by trigger', () => {
    expect(reg.byTrigger('PreToolUse').map(r => r.id)).toEqual(['A1_redundant_tool_call'])
    expect(reg.byTrigger('UserPromptSubmit').map(r => r.id)).toEqual(['B6_repeat_question'])
  })
  it('returns all', () => {
    expect(reg.all()).toHaveLength(2)
  })
  it('throws on duplicate registration', () => {
    expect(() => reg.register(sampleA)).toThrow()
  })
})
