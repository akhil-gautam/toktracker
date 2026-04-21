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
    inputPerMillion: +(input * 1_000_000).toFixed(6),
    outputPerMillion: +(output * 1_000_000).toFixed(6),
    cacheReadPerMillion: +((spec.cache_read_input_token_cost ?? 0) * 1_000_000).toFixed(6),
    cacheWritePerMillion: +((spec.cache_creation_input_token_cost ?? 0) * 1_000_000).toFixed(6),
  }
  kept++
}

const aliasLog = []
for (const [alias, pattern] of Object.entries(ALIAS_PATTERNS)) {
  const latest = pickLatest(out, pattern)
  if (!latest) { aliasLog.push(`${alias}: no match`); continue }
  out[alias] = latest.rates
  aliasLog.push(`${alias} → ${latest.key}`)
}

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${OUT} — ${kept} upstream models (${skipped} skipped)`)
console.log(`aliases: ${aliasLog.join(', ')}`)
