#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SOURCE = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'data', 'pricing.json')

const ALIAS_PATTERNS = {
  opus:   /^claude-opus-(\d{1,2})-(\d{1,2})$/,
  sonnet: /^claude-sonnet-(\d{1,2})-(\d{1,2})$/,
  haiku:  /^claude-haiku-(\d{1,2})-(\d{1,2})$/,
}

const perM = (v) => +(v * 1_000_000).toFixed(6)

// Long-context tiered + priority pricing, mirroring CodexBar's pricing fields.
// Upstream encodes the threshold in the field name (e.g.
// input_cost_per_token_above_200k_tokens), so derive it from the input rate.
function addTieredPricing(entry, spec) {
  const thrKey = Object.keys(spec).find((k) => /^input_cost_per_token_above_(\d+)k_tokens$/.test(k))
  if (thrKey) {
    const n = parseInt(thrKey.match(/_above_(\d+)k_tokens$/)[1], 10)
    entry.thresholdTokens = n * 1000
    entry.inputPerMillionAboveThreshold = perM(spec[thrKey])
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

function pickLatest(out, pattern) {
  let best = null
  let bestKey = null
  for (const [key, rates] of Object.entries(out)) {
    const m = key.match(pattern)
    if (!m) continue
    const version = [parseInt(m[1], 10), parseInt(m[2], 10)]
    if (!best || version[0] > best[0] || (version[0] === best[0] && version[1] > best[1])) {
      best = version
      bestKey = key
    }
  }
  return bestKey ? { key: bestKey, rates: out[bestKey] } : null
}

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`fetch ${SOURCE} failed: ${res.status}`)
const upstream = await res.json()

const out = {}
let kept = 0
let skipped = 0

for (const [model, spec] of Object.entries(upstream)) {
  if (model === 'sample_spec') { skipped++; continue }
  if (typeof spec !== 'object' || spec === null) { skipped++; continue }
  const input = spec.input_cost_per_token
  const output = spec.output_cost_per_token
  if (typeof input !== 'number' || typeof output !== 'number') { skipped++; continue }
  out[model] = {
    inputPerMillion: perM(input),
    outputPerMillion: perM(output),
    cacheReadPerMillion: perM(spec.cache_read_input_token_cost ?? 0),
    cacheWritePerMillion: perM(spec.cache_creation_input_token_cost ?? 0),
  }
  addTieredPricing(out[model], spec)
  kept++
}

const aliasLog = []
for (const [alias, pattern] of Object.entries(ALIAS_PATTERNS)) {
  const latest = pickLatest(out, pattern)
  if (!latest) { aliasLog.push(`${alias}: no match`); continue }
  out[alias] = latest.rates
  aliasLog.push(`${alias} → ${latest.key}`)
}

const tiered = Object.values(out).filter((e) => e.thresholdTokens != null).length
const priority = Object.values(out).filter((e) => e.priorityInputPerMillion != null).length

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${OUT} — ${kept} upstream models (${skipped} skipped)`)
console.log(`tiered (long-context): ${tiered}, priority-tier: ${priority}`)
console.log(`aliases: ${aliasLog.join(', ')}`)
