import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StateManager } from '../src/services/state-manager.js'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

describe('StateManager', () => {
  let tempDir: string
  let sm: StateManager
  beforeEach(() => { tempDir = mkdtempSync(path.join(tmpdir(), 'state-test-')); sm = new StateManager(tempDir) })
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }) })

  it('returns 0 for unknown file cursor', () => { expect(sm.getCursor('/some/file.jsonl')).toBe(0) })

  it('persists and retrieves cursors', () => {
    sm.setCursor('/some/file.jsonl', 4821); sm.save()
    const sm2 = new StateManager(tempDir)
    expect(sm2.getCursor('/some/file.jsonl')).toBe(4821)
  })

  it('updates existing cursor', () => {
    sm.setCursor('/some/file.jsonl', 100); sm.setCursor('/some/file.jsonl', 500)
    expect(sm.getCursor('/some/file.jsonl')).toBe(500)
  })

  it('handles multiple files', () => {
    sm.setCursor('/a.jsonl', 100); sm.setCursor('/b.jsonl', 200); sm.save()
    const sm2 = new StateManager(tempDir)
    expect(sm2.getCursor('/a.jsonl')).toBe(100)
    expect(sm2.getCursor('/b.jsonl')).toBe(200)
  })

  it('reads and writes budgets', () => {
    sm.saveBudgets([{ id: 'b1', scope: 'global' as const, period: 'daily' as const, limitCents: 5000, alertAtPct: 80 }])
    const sm2 = new StateManager(tempDir)
    const loaded = sm2.loadBudgets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].limitCents).toBe(5000)
  })

  it('returns empty array when no budgets file', () => { expect(sm.loadBudgets()).toEqual([]) })
  it('detects server mode', () => { expect(sm.isServerMode()).toBe(false) })
})
