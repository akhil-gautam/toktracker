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
    expect(cost).toBe(1913)
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

describe('tiered long-context pricing', () => {
  it('uses base rates below the threshold', () => {
    // claude-sonnet-4-5: base input 3, output 15 per million
    const cost = calculateCostMillicents({
      model: 'claude-sonnet-4-5',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    // (1000*3 + 500*15) / 1e6 = 0.0105 USD -> 1050 millicents
    expect(cost).toBe(1050)
  })

  it('bills the whole request at above-threshold rates once input context exceeds 200K', () => {
    // claude-sonnet-4-5: above-threshold input 6, output 22.5 per million
    const cost = calculateCostMillicents({
      model: 'claude-sonnet-4-5',
      inputTokens: 250_000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    })
    // (250000*6 + 1000*22.5) / 1e6 = 1.5225 USD -> 152250 millicents
    expect(cost).toBe(152250)
  })

  it('counts cached + cache-creation tokens toward the threshold', () => {
    // 150K fresh + 60K cache read = 210K input context > 200K -> above rates
    const cost = calculateCostMillicents({
      model: 'claude-sonnet-4-5',
      inputTokens: 150_000,
      outputTokens: 0,
      cacheReadTokens: 60_000,
      cacheWriteTokens: 0,
    })
    // (150000*6 + 60000*0.6) / 1e6 = 0.936 USD -> 93600 millicents
    expect(cost).toBe(93600)
  })
})

describe('priority service-tier pricing', () => {
  it('uses priority rates when requested and available', () => {
    // gpt-5.4 priority: input 5, output 30, cacheRead 0.5 per million
    const cost = calculateCostMillicents({
      model: 'gpt-5.4',
      inputTokens: 10_000,
      outputTokens: 1000,
      cacheReadTokens: 2000,
      cacheWriteTokens: 0,
      priority: true,
    })
    // (10000*5 + 1000*30 + 2000*0.5) / 1e6 = 0.081 USD -> 8100 millicents
    expect(cost).toBe(8100)
  })

  it('ignores the priority flag for models without priority rates', () => {
    const base = calculateCostMillicents({
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 100,
    })
    const withFlag = calculateCostMillicents({
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 2000,
      cacheWriteTokens: 100,
      priority: true,
    })
    expect(withFlag).toBe(base)
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
    expect(dollars).toBeCloseTo(5.0, 2)
  })
})
