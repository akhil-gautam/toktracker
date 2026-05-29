import type { ModelPricing, PricingMap } from '../types.js'

/**
 * Transforms LiteLLM's `model_prices_and_context_window.json` shape into our
 * PricingMap. This MIRRORS the build-time transform in scripts/sync-pricing.mjs —
 * keep the two in sync (pricing-transform.test.ts guards this one). It exists
 * separately so the optional runtime refresh (pricing-cache.ts) produces entries
 * byte-identical to the bundled pricing.json.
 */

const perM = (v: number): number => +(v * 1_000_000).toFixed(6)

function addTieredPricing(entry: ModelPricing, spec: Record<string, unknown>): void {
  const thrKey = Object.keys(spec).find((k) => /^input_cost_per_token_above_(\d+)k_tokens$/.test(k))
  if (thrKey) {
    const n = parseInt(thrKey.match(/_above_(\d+)k_tokens$/)![1], 10)
    entry.thresholdTokens = n * 1000
    entry.inputPerMillionAboveThreshold = perM(spec[thrKey] as number)
    const out = spec[`output_cost_per_token_above_${n}k_tokens`]
    const cr = spec[`cache_read_input_token_cost_above_${n}k_tokens`]
    const cw = spec[`cache_creation_input_token_cost_above_${n}k_tokens`]
    if (typeof out === 'number') entry.outputPerMillionAboveThreshold = perM(out)
    if (typeof cr === 'number') entry.cacheReadPerMillionAboveThreshold = perM(cr)
    if (typeof cw === 'number') entry.cacheWritePerMillionAboveThreshold = perM(cw)
  }

  if (typeof spec.input_cost_per_token_priority === 'number')
    entry.priorityInputPerMillion = perM(spec.input_cost_per_token_priority)
  if (typeof spec.output_cost_per_token_priority === 'number')
    entry.priorityOutputPerMillion = perM(spec.output_cost_per_token_priority)
  if (typeof spec.cache_read_input_token_cost_priority === 'number')
    entry.priorityCacheReadPerMillion = perM(spec.cache_read_input_token_cost_priority)
}

export function transformUpstream(upstream: Record<string, unknown>): PricingMap {
  const out: PricingMap = {}
  for (const [model, raw] of Object.entries(upstream)) {
    if (model === 'sample_spec') continue
    if (typeof raw !== 'object' || raw === null) continue
    const spec = raw as Record<string, unknown>
    const input = spec.input_cost_per_token
    const output = spec.output_cost_per_token
    if (typeof input !== 'number' || typeof output !== 'number') continue
    const entry: ModelPricing = {
      inputPerMillion: perM(input),
      outputPerMillion: perM(output),
      cacheReadPerMillion: perM((spec.cache_read_input_token_cost as number) ?? 0),
      cacheWritePerMillion: perM((spec.cache_creation_input_token_cost as number) ?? 0),
    }
    addTieredPricing(entry, spec)
    out[model] = entry
  }
  return out
}
