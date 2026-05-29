import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { FeatureFlagsRepo } from '../db/repository.js'
import { getPricingCacheInfo, refreshPricing } from '../services/pricing-cache.js'
import { pricingCachePath } from '../db/paths.js'

export function registerPricingCommands(program: Command): void {
  const pricing = program.command('pricing').description('Model pricing data and optional refresh')

  pricing.command('status').action(() => {
    const flag = new FeatureFlagsRepo(bootDb()).get('pricing_refresh')
    const cache = getPricingCacheInfo()
    process.stdout.write(JSON.stringify({
      refreshEnabled: !!flag?.enabled,
      cacheFile: pricingCachePath(),
      cached: cache.exists,
      source: cache.source,
      lastFetchedAt: cache.fetchedAt ? new Date(cache.fetchedAt).toISOString() : null,
      cacheAgeHours: cache.ageMs != null ? +(cache.ageMs / 3_600_000).toFixed(1) : null,
      cachedModels: cache.modelCount ?? null,
    }, null, 2) + '\n')
  })

  pricing.command('enable').description('Opt into the nightly pricing refresh').action(() => {
    new FeatureFlagsRepo(bootDb()).set('pricing_refresh', { enabled: true })
    process.stdout.write('pricing refresh enabled (runs in the daemon nightly job)\n')
  })

  pricing.command('disable').description('Opt out of the nightly pricing refresh').action(() => {
    new FeatureFlagsRepo(bootDb()).set('pricing_refresh', { enabled: false })
    process.stdout.write('pricing refresh disabled\n')
  })

  pricing.command('refresh').description('Fetch the latest pricing catalog now (one-shot)').action(async () => {
    const r = await refreshPricing()
    process.stdout.write(JSON.stringify(r) + '\n')
    if (r.status !== 'ok') process.exitCode = 1
  })
}
