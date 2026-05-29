import type Database from 'better-sqlite3'
import { BatchRunsRepo, FeatureFlagsRepo } from '../db/repository.js'
import { probeStatuses, saveStatusCache } from '../services/status-probe.js'

const FIVE_MIN = 5 * 60 * 1000

/**
 * Poll provider status pages at most every 5 minutes — but ONLY when the user has
 * opted in via the `status_polling` flag. Writes the result to the status cache for
 * the TUI to read. Best-effort: any error leaves the last-good cache in place.
 */
export async function maybeProbeStatus(db: Database.Database, now: number = Date.now()): Promise<boolean> {
  const flag = new FeatureFlagsRepo(db).get('status_polling')
  if (!flag?.enabled) return false
  const last = new BatchRunsRepo(db).lastRunAt('status_probe') ?? 0
  if (now - last < FIVE_MIN) return false
  try {
    saveStatusCache(await probeStatuses(now))
    new BatchRunsRepo(db).mark('status_probe', 'ok')
  } catch {
    new BatchRunsRepo(db).mark('status_probe', 'error')
  }
  return true
}
