import type Database from 'better-sqlite3'
import { FeatureFlagsRepo } from '../db/repository.js'

export interface ResolvedThresholds {
  enabled: boolean
  hardBlock: boolean
  thresholds: Record<string, number>
}

export class ThresholdLoader {
  private flags: FeatureFlagsRepo
  constructor(db: Database.Database) {
    this.flags = new FeatureFlagsRepo(db)
  }
  load(ruleId: string, defaults: Record<string, number>): ResolvedThresholds {
    const row = this.flags.get(ruleId)
    if (!row) return { enabled: true, hardBlock: false, thresholds: { ...defaults } }
    const config = row.config ?? {}
    const custom = (config.thresholds as Record<string, number> | undefined) ?? {}
    return {
      enabled: row.enabled === 1,
      hardBlock: !!config.hard_block,
      thresholds: { ...defaults, ...custom },
    }
  }
}
