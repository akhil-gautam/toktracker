import type { Command } from 'commander'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { installHook, uninstallHook, hookStatus } from '../hook/install.js'

export interface HookCommandDeps {
  resolveSettingsPath?: (scope: 'global' | 'local') => string
}

function defaultSettingsPath(scope: 'global' | 'local'): string {
  if (scope === 'global') return join(homedir(), '.claude', 'settings.json')
  return join(process.cwd(), '.claude', 'settings.json')
}

export function registerHookCommands(program: Command, deps: HookCommandDeps = {}): void {
  const resolve = deps.resolveSettingsPath ?? defaultSettingsPath
  const hook = program.command('hook').description('Manage Claude Code hooks')

  hook.command('install')
    .option('--global', 'install to ~/.claude/settings.json')
    .option('--local', 'install to ./.claude/settings.json', true)
    .action((opts) => {
      const scope = opts.global ? 'global' : 'local'
      const path = resolve(scope)
      installHook(path)
      process.stdout.write(`installed to ${path}\n`)
    })

  hook.command('uninstall')
    .option('--global', '')
    .option('--local', '', true)
    .action((opts) => {
      const scope = opts.global ? 'global' : 'local'
      const path = resolve(scope)
      uninstallHook(path)
      process.stdout.write(`uninstalled from ${path}\n`)
    })

  hook.command('status')
    .option('--global', '')
    .option('--local', '', true)
    .action((opts) => {
      const scope = opts.global ? 'global' : 'local'
      const path = resolve(scope)
      const s = hookStatus(path)
      process.stdout.write(JSON.stringify(s, null, 2) + '\n')
    })

  hook.command('exec <kind>')
    .description('internal: invoked by Claude Code with JSON payload on stdin')
    .action(async (kind: string) => {
      const { runHookExec, readStdinJson, emit } = await import('../hook/exec.js')
      const { bootDb } = await import('../db/boot.js')
      const { RuleRegistry } = await import('../detection/registry.js')
      const { hookLogPath } = await import('../db/paths.js')
      const payload = await readStdinJson()
      const db = bootDb()
      const registry = new RuleRegistry()
      const { registerAllRules } = await import('../detection/rules/index.js').catch(() => ({ registerAllRules: () => {} }))
      registerAllRules(registry)
      const decision = await runHookExec({ kind, payload, db, registry, logPath: hookLogPath() })
      emit(decision)
    })
}
