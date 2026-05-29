import pricingData from '../data/pricing.json' with { type: 'json' }
import type { ModelPricing, PricingMap } from '../types.js'

const pricing: PricingMap = pricingData

interface CostInput {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  // Bill at the OpenAI priority service tier when the model exposes priority rates.
  priority?: boolean
}

const ZERO_PRICING: ModelPricing = {
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

  // Tier is decided by the request's total input context (fresh + cached +
  // cache-creation). Matching real provider billing, once it crosses the
  // threshold the *whole* request bills at the above-threshold rates — a step
  // function, not the marginal per-band split CodexBar uses for Claude.
  const inputContext = input.inputTokens + input.cacheReadTokens + input.cacheWriteTokens
  const over = p.thresholdTokens != null && inputContext > p.thresholdTokens

  // Priority rates (when requested and available) take precedence; otherwise the
  // above-threshold rate applies when over the threshold; otherwise the base rate.
  const pick = (base: number, above?: number, priority?: number): number => {
    if (input.priority && priority != null) return priority
    if (over && above != null) return above
    return base
  }

  const inputRate = pick(p.inputPerMillion, p.inputPerMillionAboveThreshold, p.priorityInputPerMillion)
  const outputRate = pick(p.outputPerMillion, p.outputPerMillionAboveThreshold, p.priorityOutputPerMillion)
  const cacheReadRate = pick(p.cacheReadPerMillion, p.cacheReadPerMillionAboveThreshold, p.priorityCacheReadPerMillion)
  // Cache-creation has no priority tier; it only varies by context threshold.
  const cacheWriteRate = over && p.cacheWritePerMillionAboveThreshold != null
    ? p.cacheWritePerMillionAboveThreshold
    : p.cacheWritePerMillion

  const cost =
    (input.inputTokens * inputRate +
      input.outputTokens * outputRate +
      input.cacheReadTokens * cacheReadRate +
      input.cacheWriteTokens * cacheWriteRate) /
    1_000_000

  return Math.round(cost * 100_000)
}

export function calculateCost(input: CostInput): number {
  return calculateCostMillicents(input) / 100_000
}
