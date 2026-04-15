import { bootDb } from '../db/boot.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'
import { Poller } from './poller.js'
import { notify } from './notifier.js'
import { writePid, clearPid } from './pidfile.js'
import { maybeRunNightly } from '../scheduler/cron.js'

export async function runDaemon(intervalMs = 30_000): Promise<void> {
  writePid()
  const db = bootDb()
  const registry = new RuleRegistry()
  registerAllRules(registry)
  const poller = new Poller(db, registry, { notify })

  const cleanup = () => { clearPid(); process.exit(0) }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  while (true) {
    try { await poller.tick() } catch {}
    try { await maybeRunNightly(db, registry) } catch {}
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
