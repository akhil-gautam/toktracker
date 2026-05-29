import { describe, it, expect } from 'vitest'
import { probeStatuses, activeIncidents } from '../src/services/status-probe.js'

function fakeFetch(map: Record<string, { ok: boolean; status?: number; indicator?: string; description?: string }>): typeof fetch {
  return (async (url: string) => {
    const host = new URL(url).host
    const m = Object.entries(map).find(([k]) => host.includes(k))?.[1]
    if (!m) return { ok: false, status: 404, json: async () => ({}) }
    return {
      ok: m.ok,
      status: m.status ?? 200,
      json: async () => ({ status: { indicator: m.indicator, description: m.description } }),
    }
  }) as unknown as typeof fetch
}

describe('status-probe', () => {
  it('parses indicators from statuspage feeds', async () => {
    const cache = await probeStatuses(1000, fakeFetch({
      anthropic: { ok: true, indicator: 'none', description: 'All Systems Operational' },
      openai: { ok: true, indicator: 'major', description: 'Elevated errors' },
    }))
    const anthropic = cache.providers.find(p => p.provider === 'Anthropic')!
    const openai = cache.providers.find(p => p.provider === 'OpenAI')!
    expect(anthropic.indicator).toBe('none')
    expect(openai.indicator).toBe('major')
    expect(cache.checkedAt).toBe(1000)
  })

  it('marks unreachable/garbage feeds as unknown without throwing', async () => {
    const cache = await probeStatuses(1, fakeFetch({
      anthropic: { ok: false, status: 503 },
      openai: { ok: true, indicator: 'garbage' },
    }))
    expect(cache.providers.find(p => p.provider === 'Anthropic')!.indicator).toBe('unknown')
    expect(cache.providers.find(p => p.provider === 'OpenAI')!.indicator).toBe('unknown')
  })

  it('activeIncidents surfaces only real incidents, worst first', () => {
    const cache = {
      version: 1, checkedAt: 0, providers: [
        { provider: 'A', indicator: 'none' as const, description: '' },
        { provider: 'B', indicator: 'minor' as const, description: 'x' },
        { provider: 'C', indicator: 'critical' as const, description: 'y' },
        { provider: 'D', indicator: 'unknown' as const, description: '' },
      ],
    }
    const inc = activeIncidents(cache)
    expect(inc.map(i => i.provider)).toEqual(['C', 'B']) // critical before minor; none/unknown excluded
    expect(activeIncidents(null)).toEqual([])
  })
})
