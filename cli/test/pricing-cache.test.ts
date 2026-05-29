import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bundled from '../src/data/pricing.json' with { type: 'json' }
import type { PricingMap } from '../src/types.js'
import { passesGuard, loadCachedPricing, getPricingCacheInfo, refreshPricing } from '../src/services/pricing-cache.js'
import { pricingCachePath } from '../src/db/paths.js'

let tmp: string
let prevXdg: string | undefined

beforeEach(() => {
  prevXdg = process.env.XDG_CONFIG_HOME
  tmp = mkdtempSync(join(tmpdir(), 'tokscale-pricing-'))
  process.env.XDG_CONFIG_HOME = tmp
  mkdirSync(join(tmp, 'tokscale'), { recursive: true })
})
afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = prevXdg
  rmSync(tmp, { recursive: true, force: true })
})

describe('passesGuard (anti-corruption)', () => {
  it('accepts the full bundled catalog', () => {
    expect(passesGuard(bundled as PricingMap).ok).toBe(true)
  })
  it('rejects an empty catalog', () => {
    expect(passesGuard({}).ok).toBe(false)
  })
  it('rejects a catalog missing sentinel models', () => {
    const r = passesGuard({ 'some-random-model': { inputPerMillion: 1, outputPerMillion: 1, cacheReadPerMillion: 0, cacheWritePerMillion: 0 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/sentinel/)
  })
})

describe('cache load + info', () => {
  it('returns null when no cache file exists', () => {
    expect(loadCachedPricing()).toBeNull()
    expect(getPricingCacheInfo().exists).toBe(false)
  })

  it('loads a valid artifact and reports info', () => {
    writeFileSync(pricingCachePath(), JSON.stringify({
      version: 1, fetchedAt: 1000, source: 'https://example/api.json',
      catalog: { 'model-z': { inputPerMillion: 9, outputPerMillion: 9, cacheReadPerMillion: 0, cacheWritePerMillion: 0 } },
    }))
    expect(loadCachedPricing()?.['model-z']?.inputPerMillion).toBe(9)
    expect(getPricingCacheInfo(5000)).toMatchObject({
      exists: true, source: 'https://example/api.json', fetchedAt: 1000, ageMs: 4000, modelCount: 1,
    })
  })

  it('returns null for a corrupt / wrong-version artifact', () => {
    writeFileSync(pricingCachePath(), JSON.stringify({ version: 99, catalog: {} }))
    expect(loadCachedPricing()).toBeNull()
  })
})

describe('refreshPricing', () => {
  it('rejects a truncated catalog and does not write the cache', async () => {
    const fetchImpl = (async () => ({
      ok: true, status: 200,
      json: async () => ({ 'gpt-4.1': { input_cost_per_token: 0.000002, output_cost_per_token: 0.000008 } }),
    })) as unknown as typeof fetch
    const r = await refreshPricing({ fetchImpl })
    expect(r.status).toBe('rejected')
    expect(existsSync(pricingCachePath())).toBe(false)
  })

  it('reports an HTTP error without throwing', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch
    const r = await refreshPricing({ fetchImpl })
    expect(r.status).toBe('error')
  })
})
