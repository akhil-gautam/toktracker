import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HookLogger } from '../../src/hook/log.js'

const dir = join(tmpdir(), `tokscale-log-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const logFile = join(dir, 'hook.log')

beforeEach(() => { mkdirSync(dir, { recursive: true }) })
afterEach(() => { try { rmSync(dir, { recursive: true }) } catch {} })

describe('HookLogger', () => {
  it('writes a line with timestamp', () => {
    const log = new HookLogger(logFile, 1024)
    log.write('hello')
    expect(readFileSync(logFile, 'utf8')).toContain('hello')
  })
  it('rotates when over byte cap', () => {
    writeFileSync(logFile, 'x'.repeat(2048))
    const log = new HookLogger(logFile, 1024)
    log.write('new')
    expect(statSync(logFile).size).toBeLessThanOrEqual(1024 + 200)
    expect(existsSync(logFile + '.1')).toBe(true)
  })
})
