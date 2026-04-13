import { describe, it, expect } from 'vitest'
import { calculateCost, calculateCostMillicents } from '../src/services/cost-calculator.js'

describe('calculateCostMillicents', () => {
  it('calculates cost for claude-opus-4-6', () => {
    const cost = calculateCostMillicents({
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 100,
    })
    expect(cost).toBe(5738)
  })

  it('calculates cost for gpt-4.1', () => {
    const cost = calculateCostMillicents({
      model: 'gpt-4.1',
      inputTokens: 10000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(cost).toBe(2800)
  })

  it('returns 0 for unknown model with zero tokens', () => {
    const cost = calculateCostMillicents({
      model: 'unknown-model',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(cost).toBe(0)
  })

  it('uses zero pricing for unknown model', () => {
    const cost = calculateCostMillicents({
      model: 'some-future-model',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(cost).toBe(0)
  })
})

describe('calculateCost (dollars)', () => {
  it('converts millicents to dollars', () => {
    const dollars = calculateCost({
      model: 'claude-opus-4-6',
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(dollars).toBeCloseTo(15.0, 2)
  })
})
