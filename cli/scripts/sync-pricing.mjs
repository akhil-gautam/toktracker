#!/usr/bin/env node
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

// Pinned to an immutable commit (NOT a moving `main`) so builds are reproducible
// and any change to the pricing source is a reviewable diff to this SHA. The
// optional runtime refresh (src/services/pricing-cache.ts) is what tracks newer
// models between releases — see its anti-corruption guard.
const SOURCE_REPO = 'BerriAI/litellm'
const SOURCE_COMMIT = '5d4c4d0fce45c73c4b56b48e46dfc4e56e8b0aa5'
const SOURCE_FILE = 'model_prices_and_context_window.json'
const SOURCE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_COMMIT}/${SOURCE_FILE}`
const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'data', 'pricing.json')
const PROVENANCE = join(__dirname, '..', 'src', 'data', 'pricing-source.json')
// Keep the macOS app's bundled copy in lockstep so the two cost engines price
// identically (see the TS↔Swift parity guard in cost-calculator.test.ts).
const MAC_OUT = join(__dirname, '..', '..', 'menubar-app', 'Sources', 'Core', 'Resources', 'pricing.json')

const ALIAS_PATTERNS = {
  opus:   /^claude-opus-(\d{1,2})(?:-(\d{1,2}))?$/,
  sonnet: /^claude-sonnet-(\d{1,2})(?:-(\d{1,2}))?$/,
  haiku:  /^claude-haiku-(\d{1,2})(?:-(\d{1,2}))?$/,
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
    const version = [parseInt(m[1], 10), parseInt(m[2] ?? '0', 10)]
    if (!best || version[0] > best[0] || (version[0] === best[0] && version[1] > best[1])) {
      best = version
      bestKey = key
    }
  }
  return bestKey ? { key: bestKey, rates: out[bestKey] } : null
}

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`fetch ${SOURCE} failed: ${res.status}`)
const rawText = await res.text()
const sha256 = createHash('sha256').update(rawText).digest('hex')

// Tamper-evidence: once pricing-source.json is committed, the pinned commit is
// immutable, so re-running MUST reproduce the same content hash. A mismatch means
// the source bytes changed under us — fail loudly rather than bake new numbers.
if (existsSync(PROVENANCE)) {
  const prev = JSON.parse(readFileSync(PROVENANCE, 'utf8'))
  if (prev.sourceCommit === SOURCE_COMMIT && prev.sourceSha256 && prev.sourceSha256 !== sha256) {
    throw new Error(`checksum mismatch for ${SOURCE_COMMIT}: expected ${prev.sourceSha256}, got ${sha256}`)
  }
}

const upstream = JSON.parse(rawText)

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

const serialized = JSON.stringify(out, null, 2) + '\n'
writeFileSync(OUT, serialized)
try { writeFileSync(MAC_OUT, serialized) } catch (e) { console.warn(`warn: could not write mac copy ${MAC_OUT}: ${e.message}`) }
writeFileSync(PROVENANCE, JSON.stringify({
  sourceRepo: SOURCE_REPO,
  sourceCommit: SOURCE_COMMIT,
  sourceFile: SOURCE_FILE,
  sourceSha256: sha256,
  modelCount: kept,
}, null, 2) + '\n')
console.log(`wrote ${OUT} — ${kept} upstream models (${skipped} skipped)`)
console.log(`tiered (long-context): ${tiered}, priority-tier: ${priority}`)
console.log(`aliases: ${aliasLog.join(', ')}`)
console.log(`provenance: ${SOURCE_REPO}@${SOURCE_COMMIT.slice(0, 10)} sha256=${sha256.slice(0, 12)}…`)
