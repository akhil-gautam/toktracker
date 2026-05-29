import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { FeatureFlagsRepo } from '../db/repository.js'
import { probeStatuses, saveStatusCache, loadStatusCache } from '../services/status-probe.js'

export function registerStatusCommands(program: Command): void {
  const status = program.command('status').description('Provider status (incident) monitoring — opt-in network')

  status.command('check').description('Fetch provider status pages now (one-shot)').action(async () => {
    const cache = await probeStatuses()
    saveStatusCache(cache)
    process.stdout.write(JSON.stringify(cache, null, 2) + '\n')
  })

  status.command('enable').description('Opt into background status polling (daemon, every 5m)').action(() => {
    new FeatureFlagsRepo(bootDb()).set('status_polling', { enabled: true })
    process.stdout.write('status polling enabled (runs in the daemon every ~5m)\n')
  })

  status.command('disable').description('Opt out of background status polling').action(() => {
    new FeatureFlagsRepo(bootDb()).set('status_polling', { enabled: false })
    process.stdout.write('status polling disabled\n')
  })

  status.command('show').description('Show the last cached provider status').action(() => {
    process.stdout.write(JSON.stringify(loadStatusCache() ?? { note: 'no status cached yet — run `toktracker status check`' }, null, 2) + '\n')
  })
}
