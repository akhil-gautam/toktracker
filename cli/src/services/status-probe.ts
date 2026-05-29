import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { statusCachePath } from '../db/paths.js'

// Optional provider status-page polling. OFF by default — only the daemon polls,
// and only when the user opts in. Uses public statuspage.io JSON feeds (no auth,
// no credentials, no user data sent). Results cache to disk so the TUI can show an
// incident badge WITHOUT making its own network call.

export type StatusIndicator = 'none' | 'minor' | 'major' | 'critical' | 'unknown'

export interface ProviderStatus {
  provider: string
  indicator: StatusIndicator
  description: string
}

export interface StatusCache {
  version: number
  checkedAt: number
  providers: ProviderStatus[]
}

const CACHE_VERSION = 1

// statuspage.io v2 feeds, confirmed reachable + no-auth. (Google has no v2 feed.)
const PROBES: Array<{ provider: string; url: string }> = [
  { provider: 'Anthropic', url: 'https://anthropic.statuspage.io/api/v2/status.json' },
  { provider: 'OpenAI', url: 'https://status.openai.com/api/v2/status.json' },
]

const VALID = new Set<StatusIndicator>(['none', 'minor', 'major', 'critical'])
function normalizeIndicator(v: unknown): StatusIndicator {
  return typeof v === 'string' && VALID.has(v as StatusIndicator) ? (v as StatusIndicator) : 'unknown'
}

export async function probeStatuses(now: number = Date.now(), fetchImpl: typeof fetch = fetch): Promise<StatusCache> {
  const providers = await Promise.all(PROBES.map(async ({ provider, url }): Promise<ProviderStatus> => {
    try {
      const res = await fetchImpl(url)
      if (!res.ok) return { provider, indicator: 'unknown', description: `HTTP ${res.status}` }
      const body = (await res.json()) as { status?: { indicator?: unknown; description?: unknown } }
      return {
        provider,
        indicator: normalizeIndicator(body.status?.indicator),
        description: typeof body.status?.description === 'string' ? body.status.description : '',
      }
    } catch (err) {
      return { provider, indicator: 'unknown', description: err instanceof Error ? err.message : 'fetch failed' }
    }
  }))
  return { version: CACHE_VERSION, checkedAt: now, providers }
}

export function saveStatusCache(cache: StatusCache): void {
  const path = statusCachePath()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(cache))
  renameSync(tmp, path)
}

export function loadStatusCache(): StatusCache | null {
  try {
    const path = statusCachePath()
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    if (parsed?.version !== CACHE_VERSION || !Array.isArray(parsed.providers)) return null
    return parsed as StatusCache
  } catch {
    return null
  }
}

const RANK: Record<StatusIndicator, number> = { none: 0, unknown: 1, minor: 2, major: 3, critical: 4 }

/** The providers currently reporting a real incident (minor+), worst first. */
export function activeIncidents(cache: StatusCache | null): ProviderStatus[] {
  if (!cache) return []
  return cache.providers
    .filter(p => p.indicator === 'minor' || p.indicator === 'major' || p.indicator === 'critical')
    .sort((a, b) => RANK[b.indicator] - RANK[a.indicator])
}
