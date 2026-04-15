import type Database from 'better-sqlite3'
import { BatchRunsRepo } from '../db/repository.js'
import { DetectionsRepo } from '../db/repository.js'
import { purge } from '../db/retention.js'
import type { RuleRegistry } from '../detection/registry.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import { DetectionRunner } from '../detection/runner.js'

export async function runNightlyJobs(db: Database.Database, registry: RuleRegistry, retentionDays = 90): Promise<void> {
  const runs = new BatchRunsRepo(db)
  const runner = new DetectionRunner(db, registry, new ThresholdLoader(db), { budgetMs: 10_000 })
  const ctxBase = {
    db, trigger: 'Nightly' as const, timestamp: Date.now(),
    thresholds: {}, hardBlockEnabled: false, now: () => Date.now(),
  }

  try { await runner.run(ctxBase); runs.mark('b6_clustering', 'ok') } catch { runs.mark('b6_clustering', 'error') }
  try { await runner.run(ctxBase); runs.mark('b7_correction_clustering', 'ok') } catch { runs.mark('b7_correction_clustering', 'error') }
  try { await runner.run(ctxBase); runs.mark('b9_pattern_mining', 'ok') } catch { runs.mark('b9_pattern_mining', 'error') }
  try { await runner.run(ctxBase); runs.mark('d14_abandoned', 'ok') } catch { runs.mark('d14_abandoned', 'error') }

  try { purge(db, retentionDays); runs.mark('vacuum', 'ok') } catch { runs.mark('vacuum', 'error') }

  // prune acknowledged detections older than retention
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  db.prepare('DELETE FROM detections WHERE acknowledged_at IS NOT NULL AND created_at < ?').run(cutoff)
}
