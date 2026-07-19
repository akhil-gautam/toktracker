import { describe, it, expect } from 'vitest'
import { calculateCost, calculateCostMillicents, lookupPricing, priceSession, isModelPriced } from '../src/services/cost-calculator.js'

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

describe('lookup normalization + unpriced sentinel', () => {
  it.each([
    ['gpt-5.6', 5, 30, 0.5],
    ['gpt-5.6-terra', 2.5, 15, 0.25],
    ['gpt-5.6-luna', 1, 6, 0.1],
    ['claude-opus-4-8', 5, 25, 0.5],
    ['claude-sonnet-5', 2, 10, 0.2],
    ['gemini-3.5-flash', 1.5, 9, 0.15],
  ])('uses current base pricing for %s', (model, input, output, cacheRead) => {
    const result = lookupPricing(model)
    expect(result.priced).toBe(true)
    expect(result.pricing.inputPerMillion).toBe(input)
    expect(result.pricing.outputPerMillion).toBe(output)
    expect(result.pricing.cacheReadPerMillion).toBe(cacheRead)
  })

  it('points the sonnet alias at Claude Sonnet 5', () => {
    expect(lookupPricing('sonnet').pricing).toEqual(lookupPricing('claude-sonnet-5').pricing)
  })

  it('marks a brand-new model as unpriced instead of guessing a neighbor', () => {
    // 'gemini-3-pro' has no exact key; the old fuzzy fallback mis-matched it to
    // 'gemini-3-pro-image-preview'. It must now be unpriced with $0, not a guess.
    const r = priceSession({
      model: 'gemini-3-pro',
      inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    })
    expect(r.priced).toBe(false)
    expect(r.costMillicents).toBe(0)
    expect(isModelPriced('gemini-3-pro')).toBe(false)
  })

  it('does not fuzzy-match unrelated prefixes', () => {
    expect(isModelPriced('gpt')).toBe(false)
    expect(isModelPriced('claude')).toBe(false)
  })

  it('resolves a known model exactly', () => {
    expect(lookupPricing('claude-opus-4-6').priced).toBe(true)
    expect(lookupPricing('gpt-4.1').priced).toBe(true)
  })

  it('strips a trailing date suffix to the base model when the dated key is absent', () => {
    // A future-dated variant not in the catalog should fall back to the base family,
    // not become unpriced.
    const base = lookupPricing('claude-sonnet-4-5')
    const dated = lookupPricing('claude-sonnet-4-5-20991231')
    expect(dated.priced).toBe(true)
    expect(dated.pricing.inputPerMillion).toBe(base.pricing.inputPerMillion)
  })

  it('prefers the exact dated key over the stripped base when both exist', () => {
    // claude-sonnet-4-5-20250929 exists as its own key in the catalog.
    expect(lookupPricing('claude-sonnet-4-5-20250929').priced).toBe(true)
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
