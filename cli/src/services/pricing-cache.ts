import { readFileSync, writeFileSync, renameSync, statSync, existsSync } from 'node:fs'
import bundled from '../data/pricing.json' with { type: 'json' }
import type { PricingMap } from '../types.js'
import { pricingCachePath } from '../db/paths.js'
import { transformUpstream } from './pricing-transform.js'

// Optional runtime refresh of model pricing. OFF by default — only the daemon's
// nightly job calls refreshPricing(), and only when the user opts in. The bundled
// pricing.json is always the offline baseline/floor; the cache is an additive
// overlay that lets newly-launched models get priced between releases.

const CACHE_VERSION = 1

// Tracks newer models than the pinned build source (see scripts/sync-pricing.mjs).
// Safety comes from the anti-corruption guard below, not from pinning.
const DEFAULT_SOURCE =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

// Synthesized aliases live only in the bundled file, never upstream — exclude them
// from the "known models must survive" guard.
const ALIASES = new Set(['opus', 'sonnet', 'haiku'])
const bundledKeys = Object.keys(bundled as PricingMap).filter((k) => !ALIASES.has(k))
const KNOWN_MODEL_COUNT = bundledKeys.length
// A few base models that should always be present — their absence means a broken fetch.
const SENTINELS = ['gpt-4.1', 'claude-sonnet-4-5', 'gemini-2.5-pro'].filter((k) => k in (bundled as PricingMap))

interface CacheArtifact {
  version: number
  fetchedAt: number
  source: string
  catalog: PricingMap
}

function isValidArtifact(a: unknown): a is CacheArtifact {
  if (typeof a !== 'object' || a === null) return false
  const o = a as Record<string, unknown>
  return o.version === CACHE_VERSION && typeof o.fetchedAt === 'number' && typeof o.catalog === 'object' && o.catalog !== null
}

/**
 * Reads the on-disk overlay if present and structurally valid. Returns null when
 * absent/corrupt. No TTL check — a stale-but-valid cache is still the last-good
 * data; staleness only governs whether we *refresh*, not whether we *use* it.
 */
export function loadCachedPricing(): PricingMap | null {
  try {
    const path = pricingCachePath()
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!isValidArtifact(parsed)) return null
    return parsed.catalog
  } catch {
    return null
  }
}

export interface PricingCacheInfo {
  exists: boolean
  source?: string
  fetchedAt?: number
  ageMs?: number
  modelCount?: number
}

export function getPricingCacheInfo(now: number = Date.now()): PricingCacheInfo {
  try {
    const path = pricingCachePath()
    if (!existsSync(path)) return { exists: false }
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (!isValidArtifact(parsed)) return { exists: true }
    return {
      exists: true,
      source: parsed.source,
      fetchedAt: parsed.fetchedAt,
      ageMs: now - parsed.fetchedAt,
      modelCount: Object.keys(parsed.catalog).length,
    }
  } catch {
    return { exists: false }
  }
}

export type RefreshStatus = 'ok' | 'rejected' | 'error'
export interface RefreshResult {
  status: RefreshStatus
  modelCount?: number
  reason?: string
}

/**
 * Anti-corruption guard: a fresh catalog must still contain the sentinel base
 * models and at least ~95% of previously-known models. This rejects truncated or
 * corrupt upstream responses so a bad fetch can never wipe known pricing — the
 * last-good cache (and bundled floor) stay in place.
 */
export function passesGuard(next: PricingMap): { ok: boolean; reason?: string } {
  const count = Object.keys(next).length
  if (count === 0) return { ok: false, reason: 'empty catalog' }
  for (const s of SENTINELS) {
    if (!(s in next)) return { ok: false, reason: `missing sentinel model ${s}` }
  }
  let present = 0
  for (const k of bundledKeys) if (k in next) present++
  const ratio = KNOWN_MODEL_COUNT === 0 ? 1 : present / KNOWN_MODEL_COUNT
  if (ratio < 0.95) {
    return { ok: false, reason: `catalog dropped ${Math.round((1 - ratio) * 100)}% of known models` }
  }
  return { ok: true }
}

export interface RefreshOptions {
  url?: string
  now?: number
  fetchImpl?: typeof fetch
}

export async function refreshPricing(opts: RefreshOptions = {}): Promise<RefreshResult> {
  const url = opts.url ?? DEFAULT_SOURCE
  const now = opts.now ?? Date.now()
  const doFetch = opts.fetchImpl ?? fetch
  try {
    const res = await doFetch(url)
    if (!res.ok) return { status: 'error', reason: `HTTP ${res.status}` }
    const upstream = (await res.json()) as Record<string, unknown>
    const catalog = transformUpstream(upstream)

    const guard = passesGuard(catalog)
    if (!guard.ok) return { status: 'rejected', reason: guard.reason }

    const artifact: CacheArtifact = { version: CACHE_VERSION, fetchedAt: now, source: url, catalog }
    const path = pricingCachePath()
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(artifact))
    renameSync(tmp, path)
    return { status: 'ok', modelCount: Object.keys(catalog).length }
  } catch (err) {
    return { status: 'error', reason: err instanceof Error ? err.message : String(err) }
  }
}
