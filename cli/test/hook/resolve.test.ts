import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = join(tmpdir(), `tokscale-resolve-${Date.now()}`)
const settings = join(dir, 'settings.json')

beforeEach(() => { mkdirSync(dir, { recursive: true }); writeFileSync(settings, JSON.stringify({})) })
afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('resolveHookCommand', () => {
  it('env override wins over all other strategies', async () => {
    const orig = process.env.TOKSCALE_HOOK_COMMAND
    try {
      process.env.TOKSCALE_HOOK_COMMAND = '/custom/tokscale hook exec'
      const { resolveHookCommand } = await import('../../src/hook/install.js')
      expect(resolveHookCommand()).toBe('/custom/tokscale hook exec')
    } finally {
      if (orig === undefined) delete process.env.TOKSCALE_HOOK_COMMAND
      else process.env.TOKSCALE_HOOK_COMMAND = orig
    }
  })

  it('argv[1] path variant produces command starting with process.execPath', async () => {
    const orig = process.env.TOKSCALE_HOOK_COMMAND
    delete process.env.TOKSCALE_HOOK_COMMAND
    try {
      // process.argv[1] is the current test runner script which exists on disk
      const { resolveHookCommand } = await import('../../src/hook/install.js')
      const cmd = resolveHookCommand()
      // argv[1] exists (it's the vitest runner), so we expect the execPath variant
      expect(cmd).toContain(process.execPath)
      expect(cmd).toContain('hook exec')
    } finally {
      if (orig === undefined) delete process.env.TOKSCALE_HOOK_COMMAND
      else process.env.TOKSCALE_HOOK_COMMAND = orig
    }
  })
})

describe('tokscale_managed marker survives JSON round-trip', () => {
  it('install → JSON stringify/parse → hookStatus still reports installed', async () => {
    const orig = process.env.TOKSCALE_HOOK_COMMAND
    delete process.env.TOKSCALE_HOOK_COMMAND
    try {
      const { installHook, hookStatus } = await import('../../src/hook/install.js')
      installHook(settings)
      // Simulate JSON round-trip: write then read back
      const raw = readFileSync(settings, 'utf8')
      const parsed = JSON.parse(raw)
      writeFileSync(settings, JSON.stringify(parsed))
      const status = hookStatus(settings)
      expect(status.installed).toBe(true)
      expect(status.kinds).toHaveLength(4)
    } finally {
      if (orig === undefined) delete process.env.TOKSCALE_HOOK_COMMAND
      else process.env.TOKSCALE_HOOK_COMMAND = orig
    }
  })

  it('uninstall round-trip removes all tokscale_managed entries after JSON parse', async () => {
    const orig = process.env.TOKSCALE_HOOK_COMMAND
    delete process.env.TOKSCALE_HOOK_COMMAND
    try {
      const { installHook, uninstallHook } = await import('../../src/hook/install.js')
      installHook(settings)
      // JSON round-trip
      const raw = readFileSync(settings, 'utf8')
      writeFileSync(settings, JSON.stringify(JSON.parse(raw)))
      // Uninstall after round-trip
      uninstallHook(settings)
      const afterRaw = readFileSync(settings, 'utf8')
      // No tokscale_managed entries should remain
      expect(afterRaw).not.toContain('tokscale_managed')
    } finally {
      if (orig === undefined) delete process.env.TOKSCALE_HOOK_COMMAND
      else process.env.TOKSCALE_HOOK_COMMAND = orig
    }
  })
})
