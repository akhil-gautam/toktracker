import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { rmSync } from 'node:fs'
import { dbPath, configDir, pricingCachePath } from '../db/paths.js'
import { closeDb } from '../db/connection.js'
import { FeatureFlagsRepo } from '../db/repository.js'
import { getPricingCacheInfo } from '../services/pricing-cache.js'
import { createInterface } from 'node:readline/promises'

export function registerPrivacyCommands(program: Command): void {
  const privacy = program.command('privacy').description('Inspect or wipe stored data')
  privacy.command('audit').action(() => {
    const db = bootDb()
    const counts: Record<string, number> = {}
    for (const t of ['sessions','messages','tool_calls','hook_events','git_events','detections','redaction_rules']) {
      counts[t] = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c
    }
    // Disclose the optional pricing refresh network behavior, if any.
    const flag = new FeatureFlagsRepo(db).get('pricing_refresh')
    const cache = getPricingCacheInfo()
    const pricingRefresh = {
      enabled: !!flag?.enabled,
      cacheFile: pricingCachePath(),
      cached: cache.exists,
      source: cache.source,
      lastFetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : undefined,
      cacheAgeHours: cache.ageMs != null ? +(cache.ageMs / 3_600_000).toFixed(1) : undefined,
      cachedModels: cache.modelCount,
    }
    process.stdout.write(JSON.stringify({ ...counts, pricingRefresh }, null, 2) + '\n')
  })
  program.command('wipe').action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('type WIPE to destroy all local data: ')
    rl.close()
    if (answer !== 'WIPE') { process.stdout.write('aborted\n'); return }
    closeDb()
    try { rmSync(dbPath()) } catch {}
    for (const suffix of ['-wal', '-shm']) { try { rmSync(dbPath() + suffix) } catch {} }
    try { rmSync(pricingCachePath()) } catch {}
    process.stdout.write(`wiped contents under ${configDir()}\n`)
  })
}
