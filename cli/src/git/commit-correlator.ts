import type Database from 'better-sqlite3'
import { CommitAttributionsRepo } from '../db/repository.js'
import type { GitCommitEntry } from './event-worker.js'

/// Attach each commit to the per-turn session row that was active on the same
/// `(repo, branch)` within a 12h lookback window before the commit landed.
/// We pick the most expensive candidate in the window so the attribution
/// points at the session that actually did the work.
export function correlateCommits(
  db: Database.Database,
  repo: string,
  commits: GitCommitEntry[],
): void {
  const attr = new CommitAttributionsRepo(db)
  const findStmt = db.prepare(`
    SELECT id FROM sessions
    WHERE git_repo = ?
      AND git_branch = ?
      AND started_at >= ?
      AND started_at <= ?
    ORDER BY cost_millicents DESC
    LIMIT 1
  `)
  for (const c of commits) {
    if (!c.branch) continue
    const committedAt = Date.parse(c.authoredAt)
    if (!Number.isFinite(committedAt)) continue
    const windowStart = committedAt - 12 * 3600 * 1000
    const row = findStmt.get(repo, c.branch, windowStart, committedAt) as { id?: string } | undefined
    if (!row?.id) continue
    attr.upsert({
      sha: c.sha, repo, sessionId: row.id,
      branch: c.branch ?? null, subject: c.subject ?? null,
      committedAt, createdAt: Date.now(),
    })
  }
}
