import pricingData from '../data/pricing.json' with { type: 'json' }
import type { PricingMap } from '../types.js'

const pricing: PricingMap = pricingData

interface CostInput {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

const ZERO_PRICING = {
  inputPerMillion: 0,
  outputPerMillion: 0,
  cacheReadPerMillion: 0,
  cacheWritePerMillion: 0,
}

function lookupPricing(model: string) {
  if (pricing[model]) return pricing[model]

  for (const key of Object.keys(pricing)) {
    if (model.startsWith(key) || key.startsWith(model)) {
      return pricing[key]
    }
  }

  return ZERO_PRICING
}

export function calculateCostMillicents(input: CostInput): number {
  const p = lookupPricing(input.model)

  const cost =
    (input.inputTokens * p.inputPerMillion +
      input.outputTokens * p.outputPerMillion +
      input.cacheReadTokens * p.cacheReadPerMillion +
      input.cacheWriteTokens * p.cacheWritePerMillion) /
    1_000_000

  return Math.round(cost * 100_000)
}

export function calculateCost(input: CostInput): number {
  return calculateCostMillicents(input) / 100_000
}
