import { describe, it, expect } from 'vitest'
import { configDir, dbPath, hookLogPath, modelsDir, pidFilePath } from '../../src/db/paths.js'

describe('paths', () => {
  it('resolves config dir ending in "tokscale"', () => {
    expect(configDir().endsWith('tokscale')).toBe(true)
  })
  it('joins db path under config dir', () => {
    expect(dbPath()).toBe(configDir() + '/toktracker.db')
  })
  it('exposes hook log + models + pid paths', () => {
    expect(hookLogPath()).toContain('hook.log')
    expect(modelsDir()).toContain('models')
    expect(pidFilePath()).toContain('daemon.pid')
  })
})
