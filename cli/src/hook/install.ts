import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const TOKSCALE_MARKER_KEY = 'tokscale_managed'
const HOOK_KINDS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'] as const

interface HookEntry {
  type: 'command'
  command: string
  tokscale_managed?: boolean
}

interface Entry {
  matcher?: string
  hooks: HookEntry[]
}

export interface HookStatus {
  installed: boolean
  kinds: string[]
}

/**
 * Resolve the best absolute command string to embed in settings.json.
 * Priority:
 *   1. TOKSCALE_HOOK_COMMAND env var (power-user escape hatch)
 *   2. process.argv[1] exists on disk → use absolute node + script path
 *   3. `which toktracker` resolves → use `toktracker hook exec`
 *   4. fallback → `npx -y toktracker hook exec`
 */
export function resolveHookCommand(): string {
  if (process.env.TOKSCALE_HOOK_COMMAND) {
    return process.env.TOKSCALE_HOOK_COMMAND
  }
  const argv1 = process.argv[1]
  if (argv1 && existsSync(argv1)) {
    return `"${process.execPath}" "${argv1}" hook exec`
  }
  try {
    const result = spawnSync('which', ['toktracker'], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) {
      return 'toktracker hook exec'
    }
  } catch {
    // ignore
  }
  return 'npx -y toktracker hook exec'
}

function readSettings(path: string): any {
  if (!existsSync(path)) return {}
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return {} }
}

function writeSettings(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2))
}

function entryFor(kind: string, command: string): Entry {
  const hookEntry: HookEntry = { type: 'command', command: `${command} ${kind}`, [TOKSCALE_MARKER_KEY]: true }
  const base: Entry = { hooks: [hookEntry] }
  if (kind === 'PreToolUse' || kind === 'PostToolUse') base.matcher = '*'
  return base
}

export function installHook(settingsPath: string, command?: string): void {
  const cmd = command ?? resolveHookCommand()
  if (!existsSync(settingsPath + '.tokscale-bak') && existsSync(settingsPath)) {
    copyFileSync(settingsPath, settingsPath + '.tokscale-bak')
  }
  const s = readSettings(settingsPath)
  s.hooks = s.hooks ?? {}
  for (const kind of HOOK_KINDS) {
    const existing: Entry[] = s.hooks[kind] ?? []
    const filtered = existing.filter(e => !isTokscaleEntry(e))
    filtered.push(entryFor(kind, cmd))
    s.hooks[kind] = filtered
  }
  writeSettings(settingsPath, s)
}

export function uninstallHook(settingsPath: string): void {
  const s = readSettings(settingsPath)
  if (!s.hooks) return
  for (const kind of HOOK_KINDS) {
    const existing: Entry[] = s.hooks[kind] ?? []
    const filtered = existing.filter(e => !isTokscaleEntry(e))
    if (filtered.length > 0) s.hooks[kind] = filtered
    else delete s.hooks[kind]
  }
  if (Object.keys(s.hooks).length === 0) delete s.hooks
  writeSettings(settingsPath, s)
}

export function hookStatus(settingsPath: string): HookStatus {
  const s = readSettings(settingsPath)
  const kinds: string[] = []
  for (const kind of HOOK_KINDS) {
    const entries: Entry[] = s.hooks?.[kind] ?? []
    if (entries.some(isTokscaleEntry)) kinds.push(kind)
  }
  return { installed: kinds.length === HOOK_KINDS.length, kinds }
}

function isTokscaleEntry(e: Entry): boolean {
  return (e.hooks ?? []).some(h => h[TOKSCALE_MARKER_KEY] === true)
}
