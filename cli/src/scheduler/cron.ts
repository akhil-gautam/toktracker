import type Database from 'better-sqlite3'
import type { RuleRegistry } from '../detection/registry.js'
import { BatchRunsRepo } from '../db/repository.js'
import { runNightlyJobs } from './jobs.js'

const ONE_DAY = 24 * 60 * 60 * 1000

export async function maybeRunNightly(db: Database.Database, registry: RuleRegistry): Promise<boolean> {
  const last = new BatchRunsRepo(db).lastRunAt('nightly_anchor') ?? 0
  if (Date.now() - last < ONE_DAY) return false
  await runNightlyJobs(db, registry)
  new BatchRunsRepo(db).mark('nightly_anchor', 'ok')
  return true
}
