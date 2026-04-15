import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { rmSync } from 'node:fs'
import { dbPath, configDir } from '../db/paths.js'
import { closeDb } from '../db/connection.js'
import { createInterface } from 'node:readline/promises'

export function registerPrivacyCommands(program: Command): void {
  const privacy = program.command('privacy').description('Inspect or wipe stored data')
  privacy.command('audit').action(() => {
    const db = bootDb()
    const counts: Record<string, number> = {}
    for (const t of ['sessions','messages','tool_calls','hook_events','git_events','detections','redaction_rules']) {
      counts[t] = (db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number }).c
    }
    process.stdout.write(JSON.stringify(counts, null, 2) + '\n')
  })
  program.command('wipe').action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await rl.question('type WIPE to destroy all local data: ')
    rl.close()
    if (answer !== 'WIPE') { process.stdout.write('aborted\n'); return }
    closeDb()
    try { rmSync(dbPath()) } catch {}
    for (const suffix of ['-wal', '-shm']) { try { rmSync(dbPath() + suffix) } catch {} }
    process.stdout.write(`wiped contents under ${configDir()}\n`)
  })
}
