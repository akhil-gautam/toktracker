import type Database from 'better-sqlite3'
import type { RuleRegistry } from '../detection/registry.js'
import { DetectionRunner } from '../detection/runner.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import type { Detection } from '../detection/types.js'

export interface PollerDeps {
  notify?: (d: Detection) => void
}

export class Poller {
  private db: Database.Database
  private runner: DetectionRunner
  private notify: (d: Detection) => void
  constructor(db: Database.Database, registry: RuleRegistry, deps: PollerDeps = {}) {
    this.db = db
    this.runner = new DetectionRunner(db, registry, new ThresholdLoader(db), { budgetMs: 500 })
    this.notify = deps.notify ?? (() => {})
  }
  async tick(): Promise<void> {
    const ctx = {
      db: this.db,
      trigger: 'PollTick' as const,
      timestamp: Date.now(),
      thresholds: {},
      hardBlockEnabled: false,
      now: () => Date.now(),
    }
    const { detections } = await this.runner.run(ctx)
    for (const d of detections) if (d.severity !== 'info') this.notify(d)
  }
}
