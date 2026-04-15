import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Command } from 'commander'
import { registerHookCommands } from '../../src/cli/hook-commands.js'

const dir = join(tmpdir(), `tokscale-hookcli-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const settings = join(dir, 'settings.json')

beforeEach(() => { mkdirSync(dir, { recursive: true }); writeFileSync(settings, JSON.stringify({})) })
afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('hook CLI commands', () => {
  it('install writes entries to settings.json', async () => {
    const program = new Command()
    registerHookCommands(program, { resolveSettingsPath: () => settings })
    await program.parseAsync(['node', 'cli', 'hook', 'install', '--local'])
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(s.hooks.PreToolUse).toBeTruthy()
  })
  it('uninstall removes entries', async () => {
    const program = new Command()
    registerHookCommands(program, { resolveSettingsPath: () => settings })
    await program.parseAsync(['node', 'cli', 'hook', 'install', '--local'])
    await program.parseAsync(['node', 'cli', 'hook', 'uninstall', '--local'])
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(s.hooks).toBeUndefined()
  })
})
