import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { DetectionsRepo } from '../../src/db/repository.js'
import { RuleRegistry } from '../../src/detection/registry.js'
import { ThresholdLoader } from '../../src/detection/thresholds.js'
import { DetectionRunner } from '../../src/detection/runner.js'
import type { Rule } from '../../src/detection/types.js'

const tmp = join(tmpdir(), `tokscale-runner-${Date.now()}.db`)
beforeEach(() => { migrate(getDb(tmp)) })
afterEach(() => { closeDb(); for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} } })

const warnRule: Rule = {
  id: 'R_warn', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'warn',
  hardBlockEligible: false, defaultThresholds: {},
  evaluate: () => ({ ruleId: 'R_warn', severity: 'warn', summary: 'warn me' }),
}
const blockRule: Rule = {
  id: 'R_block', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'warn',
  hardBlockEligible: true, defaultThresholds: {},
  evaluate: () => ({ ruleId: 'R_block', severity: 'warn', summary: 'block me' }),
}

describe('DetectionRunner', () => {
  it('aggregates severities: warn+warn→warn without block', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); reg.register(warnRule); reg.register({ ...warnRule, id: 'R_warn2' })
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db))
    const { detections, decision } = await runner.run({
      db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: false, now: () => 1,
    })
    expect(detections.length).toBe(2)
    expect(decision.decision).toBeUndefined()
  })

  it('block eligible + hardBlockEnabled → decision=block', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); reg.register(blockRule)
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db))
    const { decision } = await runner.run({
      db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: true, now: () => 1,
    })
    expect(decision.decision).toBe('block')
  })

  it('writes detections to DB', async () => {
    const db = getDb(tmp)
    const reg = new RuleRegistry(); reg.register(warnRule)
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db))
    await runner.run({ db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: false, now: () => 1 })
    expect(new DetectionsRepo(db).recent(10).length).toBe(1)
  })

  it('honours 200ms budget — skips slow rules', async () => {
    const db = getDb(tmp)
    const slow: Rule = {
      id: 'R_slow', category: 'A', triggers: ['PreToolUse'], defaultSeverity: 'info',
      hardBlockEligible: false, defaultThresholds: {},
      evaluate: () => new Promise(res => setTimeout(() => res({ ruleId: 'R_slow', severity: 'info', summary: 's' }), 300)),
    }
    const reg = new RuleRegistry(); reg.register(slow)
    const runner = new DetectionRunner(db, reg, new ThresholdLoader(db), { budgetMs: 50 })
    const { detections } = await runner.run({
      db, trigger: 'PreToolUse', timestamp: 1, thresholds: {}, hardBlockEnabled: false, now: () => 1,
    })
    expect(detections.length).toBe(0)
  })
})
