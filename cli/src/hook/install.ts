import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const TOKSCALE_MARKER = '__tokscale_managed__'
const HOOK_KINDS = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'] as const

interface Entry {
  matcher?: string
  hooks: Array<{ type: 'command'; command: string; [TOKSCALE_MARKER]?: boolean }>
}

export interface HookStatus {
  installed: boolean
  kinds: string[]
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
  const base: Entry = { hooks: [{ type: 'command', command: `${command} ${kind}`, [TOKSCALE_MARKER]: true }] }
  if (kind === 'PreToolUse' || kind === 'PostToolUse') base.matcher = '*'
  return base
}

export function installHook(settingsPath: string, command: string): void {
  if (!existsSync(settingsPath + '.tokscale-bak') && existsSync(settingsPath)) {
    copyFileSync(settingsPath, settingsPath + '.tokscale-bak')
  }
  const s = readSettings(settingsPath)
  s.hooks = s.hooks ?? {}
  for (const kind of HOOK_KINDS) {
    const existing: Entry[] = s.hooks[kind] ?? []
    const filtered = existing.filter(e => !isTokscaleEntry(e))
    filtered.push(entryFor(kind, command))
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
  return (e.hooks ?? []).some(h => h[TOKSCALE_MARKER] === true)
}
