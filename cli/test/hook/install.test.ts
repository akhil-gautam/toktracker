import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installHook, uninstallHook, hookStatus } from '../../src/hook/install.js'

const dir = join(tmpdir(), `tokscale-hook-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const settings = join(dir, 'settings.json')

beforeEach(() => { mkdirSync(dir, { recursive: true }); writeFileSync(settings, JSON.stringify({}, null, 2)) })
afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('install / uninstall hook', () => {
  it('adds tokscale-managed entries for all four hook kinds', () => {
    installHook(settings, 'tokscale hook exec')
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    for (const k of ['PreToolUse','PostToolUse','UserPromptSubmit','Stop']) expect(s.hooks[k]).toBeTruthy()
    expect(existsSync(settings + '.tokscale-bak')).toBe(true)
  })
  it('is idempotent (no duplicates on repeat install)', () => {
    installHook(settings, 'tokscale hook exec')
    installHook(settings, 'tokscale hook exec')
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(s.hooks.PreToolUse.length).toBe(1)
  })
  it('preserves non-tokscale hook entries on uninstall', () => {
    writeFileSync(settings, JSON.stringify({
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'other-tool' }] }] },
    }))
    installHook(settings, 'tokscale hook exec')
    uninstallHook(settings)
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    expect(JSON.stringify(s.hooks.PreToolUse)).toContain('other-tool')
    expect(JSON.stringify(s.hooks.PreToolUse)).not.toContain('tokscale')
  })
  it('status reports installed scope', () => {
    installHook(settings, 'tokscale hook exec')
    expect(hookStatus(settings).installed).toBe(true)
  })
})
