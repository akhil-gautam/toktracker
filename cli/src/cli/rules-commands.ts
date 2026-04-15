import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { FeatureFlagsRepo } from '../db/repository.js'
import { RuleRegistry } from '../detection/registry.js'
import { registerAllRules } from '../detection/rules/index.js'
import { ThresholdLoader } from '../detection/thresholds.js'

export function registerRulesCommands(program: Command): void {
  const r = program.command('rules').description('Manage detection rules')
  r.command('list').action(() => {
    const db = bootDb()
    const reg = new RuleRegistry(); registerAllRules(reg)
    const loader = new ThresholdLoader(db)
    for (const rule of reg.all()) {
      const t = loader.load(rule.id, rule.defaultThresholds)
      process.stdout.write(`[${rule.category}] ${rule.id}\t${t.enabled ? 'on' : 'off'}\thard=${t.hardBlock}\tthresholds=${JSON.stringify(t.thresholds)}\n`)
    }
  })
  r.command('enable <id>').action(id => setFlag(id, { enabled: true }))
  r.command('disable <id>').action(id => setFlag(id, { enabled: false }))
  r.command('hard-block <id>').action(id => setFlag(id, { hard_block: true }))
  r.command('set-threshold <id> <key> <value>').action((id, key, value) => {
    const db = bootDb()
    const flags = new FeatureFlagsRepo(db)
    const existing = flags.get(id)?.config ?? {}
    const thresholds = (existing.thresholds as Record<string, number> | undefined) ?? {}
    thresholds[key] = Number(value)
    flags.set(id, { ...existing, thresholds })
  })
}

function setFlag(id: string, patch: Record<string, unknown>): void {
  const db = bootDb()
  const flags = new FeatureFlagsRepo(db)
  const existing = flags.get(id)?.config ?? {}
  flags.set(id, { ...existing, ...patch })
}
