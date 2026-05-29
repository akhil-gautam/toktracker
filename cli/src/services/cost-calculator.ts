import pricingData from '../data/pricing.json' with { type: 'json' }
import type { ModelPricing, PricingMap } from '../types.js'
import { loadCachedPricing } from './pricing-cache.js'

// Bundled pricing is the always-present baseline/floor. If the optional runtime
// refresh has written a cache, overlay it (additive — it only adds/updates models,
// never removes the bundled floor). Computed once at module load.
const pricing: PricingMap = (() => {
  const base: PricingMap = { ...(pricingData as PricingMap) }
  const overlay = loadCachedPricing()
  return overlay ? { ...base, ...overlay } : base
})()

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

// Deterministic normalization: from the most specific model id, strip recognized
// trailing markers one at a time — @YYYYMMDD (vertex), :N (bedrock), -vN, -YYYYMMDD —
// yielding progressively-shorter candidates that are each matched EXACTLY.
// We never scan for arbitrary prefix overlaps: that silently mis-priced new models
// against unrelated siblings (e.g. 'gemini-3-pro' -> 'gemini-3-pro-image-preview').
function candidateKeys(model: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (k: string) => { if (k && !seen.has(k)) { seen.add(k); out.push(k) } }

  push(model)
  let cur = model
  for (let i = 0; i < 8; i++) {
    let next = cur
    if (/@\d{8}$/.test(next)) next = next.replace(/@\d{8}$/, '')
    else if (/:\d+$/.test(next)) next = next.replace(/:\d+$/, '')
    else if (/-v\d+$/.test(next)) next = next.replace(/-v\d+$/, '')
    else if (/-\d{8}$/.test(next)) next = next.replace(/-\d{8}$/, '')
    if (next === cur) break
    push(next)
    cur = next
  }
  return out
}

export interface PricingLookup {
  pricing: ModelPricing
  priced: boolean
}

export function lookupPricing(model: string): PricingLookup {
  for (const key of candidateKeys(model)) {
    const p = pricing[key]
    if (p) return { pricing: p, priced: true }
  }
  // Unknown model: return an explicit unpriced sentinel (cost $0) rather than
  // guessing a neighbor's price. Callers should mark the session unpriced.
  return { pricing: ZERO_PRICING, priced: false }
}

export function isModelPriced(model: string): boolean {
  return lookupPricing(model).priced
}

export interface CostResult {
  costMillicents: number
  priced: boolean
}

export function priceSession(input: CostInput): CostResult {
  const { pricing: p, priced } = lookupPricing(input.model)

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

  return { costMillicents: Math.round(cost * 100_000), priced }
}

export function calculateCostMillicents(input: CostInput): number {
  return priceSession(input).costMillicents
}

export function calculateCost(input: CostInput): number {
  return calculateCostMillicents(input) / 100_000
}
