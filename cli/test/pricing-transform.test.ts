import { describe, it, expect } from 'vitest'
import { transformUpstream } from '../src/services/pricing-transform.js'

describe('transformUpstream', () => {
  it('converts per-token rates to per-million and skips invalid entries', () => {
    const out = transformUpstream({
      sample_spec: { input_cost_per_token: 1 },          // skipped by name
      'no-cost-model': { litellm_provider: 'x' },        // skipped: no numeric costs
      'gpt-x': { input_cost_per_token: 0.000002, output_cost_per_token: 0.000008 },
    })
    expect(out['sample_spec']).toBeUndefined()
    expect(out['no-cost-model']).toBeUndefined()
    expect(out['gpt-x']).toEqual({
      inputPerMillion: 2,
      outputPerMillion: 8,
      cacheReadPerMillion: 0,
      cacheWritePerMillion: 0,
    })
  })

  it('extracts tiered (long-context) and priority fields', () => {
    const out = transformUpstream({
      'sonnet-x': {
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
        cache_read_input_token_cost: 0.0000003,
        cache_creation_input_token_cost: 0.00000375,
        input_cost_per_token_above_200k_tokens: 0.000006,
        output_cost_per_token_above_200k_tokens: 0.0000225,
        cache_read_input_token_cost_above_200k_tokens: 0.0000006,
        cache_creation_input_token_cost_above_200k_tokens: 0.0000075,
        input_cost_per_token_priority: 0.000006,
        output_cost_per_token_priority: 0.00003,
        cache_read_input_token_cost_priority: 0.0000006,
      },
    })
    expect(out['sonnet-x']).toMatchObject({
      inputPerMillion: 3,
      outputPerMillion: 15,
      cacheReadPerMillion: 0.3,
      cacheWritePerMillion: 3.75,
      thresholdTokens: 200000,
      inputPerMillionAboveThreshold: 6,
      outputPerMillionAboveThreshold: 22.5,
      cacheReadPerMillionAboveThreshold: 0.6,
      cacheWritePerMillionAboveThreshold: 7.5,
      priorityInputPerMillion: 6,
      priorityOutputPerMillion: 30,
      priorityCacheReadPerMillion: 0.6,
    })
  })
})
