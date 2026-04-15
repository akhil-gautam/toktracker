import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'

export function registerExportCommands(program: Command): void {
  program.command('export').option('--since <date>', '', '1970-01-01').action((opts) => {
    const db = bootDb()
    const since = Date.parse(opts.since) || 0
    const sessions = db.prepare('SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at').all(since)
    const detections = db.prepare('SELECT * FROM detections WHERE created_at >= ?').all(since)
    process.stdout.write(JSON.stringify({ sessions, detections }, null, 2))
  })
  program.command('vacuum').action(async () => {
    const { purge } = await import('../db/retention.js')
    const r = purge(bootDb(), 90)
    process.stdout.write(JSON.stringify(r) + '\n')
  })
}
