import type { Command } from 'commander'
import { spawn } from 'node:child_process'
import { readPid, clearPid, isRunning } from '../daemon/pidfile.js'
import { runDaemon } from '../daemon/runner.js'

export function registerDaemonCommands(program: Command): void {
  const daemon = program.command('daemon').description('Background watcher for non-hook tools')
  daemon.command('start')
    .option('--detach', 'run detached')
    .action(async (opts) => {
      if (opts.detach) {
        const child = spawn(process.argv[0], [process.argv[1], 'daemon', 'start'], { detached: true, stdio: 'ignore' })
        child.unref()
        process.stdout.write(`daemon started pid=${child.pid}\n`)
        return
      }
      await runDaemon()
    })
  daemon.command('stop').action(() => {
    const pid = readPid()
    if (!pid) { process.stdout.write('not running\n'); return }
    try { process.kill(pid, 'SIGTERM') } catch {}
    clearPid()
    process.stdout.write('stopped\n')
  })
  daemon.command('status').action(() => {
    const pid = readPid()
    process.stdout.write(pid && isRunning(pid) ? `running pid=${pid}\n` : 'stopped\n')
  })
}
