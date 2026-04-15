import type Database from 'better-sqlite3'
import { PrAttributionsRepo } from '../db/repository.js'

interface PrRow { repo: string; pr_number: number; branch: string | null; sha: string | null; created_at: number }

export function correlatePrToSessions(db: Database.Database, repo: string, prNumber: number): void {
  const pr = db.prepare(`SELECT repo, pr_number, branch, sha, created_at FROM git_events WHERE repo = ? AND pr_number = ? AND kind = 'pr_merged'`).get(repo, prNumber) as PrRow | undefined
  if (!pr) return

  const attrRepo = new PrAttributionsRepo(db)

  if (pr.branch) {
    const branchRows = db.prepare(`SELECT id FROM sessions WHERE git_repo = ? AND git_branch = ?`).all(repo, pr.branch) as { id: string }[]
    for (const r of branchRows) {
      attrRepo.upsert({ repo, prNumber, sessionId: r.id, overlapKind: 'branch_match', confidence: 0.95 })
    }
  }

  if (pr.sha) {
    const shaRows = db.prepare(`SELECT id FROM sessions WHERE git_repo = ? AND (git_commit_start = ? OR git_commit_end = ?)`).all(repo, pr.sha, pr.sha) as { id: string }[]
    for (const r of shaRows) {
      attrRepo.upsert({ repo, prNumber, sessionId: r.id, overlapKind: 'commit_ancestor', confidence: 0.8 })
    }
  }
}
