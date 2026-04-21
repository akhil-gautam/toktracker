import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { PrAttributionsRepo } from '../db/repository.js'

export interface PrSummary {
  repo: string
  prNumber: number
  title: string | null
  costCents: number
  sessions: number
}

export interface CommitSummary {
  sha: string
  repo: string
  subject: string | null
  branch: string | null
  committedAt: number
  cost: number
}

export function usePrAttributions(db: Database.Database): PrSummary[] {
  const [rows, setRows] = useState<PrSummary[]>([])
  useEffect(() => {
    const load = () => {
      const groups = db.prepare(`
        SELECT pa.repo, pa.pr_number, COUNT(*) as sessions,
          (SELECT title FROM git_events ge
           WHERE ge.repo = pa.repo AND ge.pr_number = pa.pr_number
             AND ge.title IS NOT NULL
           ORDER BY ge.created_at DESC LIMIT 1) as title
        FROM pr_attributions pa
        GROUP BY pa.repo, pa.pr_number
        ORDER BY pa.pr_number DESC LIMIT 100
      `).all() as Array<{ repo: string; pr_number: number; sessions: number; title: string | null }>
      const repo = new PrAttributionsRepo(db)
      setRows(groups.map(g => ({
        repo: g.repo, prNumber: g.pr_number, sessions: g.sessions,
        title: g.title,
        costCents: repo.totalCostCentsForPr(g.repo, g.pr_number),
      })))
    }
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [db])
  return rows
}

export function useCommitAttributions(db: Database.Database, limit: number = 30): CommitSummary[] {
  const [rows, setRows] = useState<CommitSummary[]>([])
  useEffect(() => {
    const load = () => {
      const result = db.prepare(`
        SELECT ca.commit_sha, ca.repo, ca.branch, ca.subject, ca.committed_at,
          COALESCE(s.cost_millicents, 0) AS cost
        FROM commit_attributions ca
        LEFT JOIN sessions s ON s.id = ca.session_id
        ORDER BY ca.committed_at DESC LIMIT ?
      `).all(limit) as Array<{
        commit_sha: string; repo: string; branch: string | null;
        subject: string | null; committed_at: number; cost: number
      }>
      setRows(result.map(r => ({
        sha: r.commit_sha, repo: r.repo,
        branch: r.branch, subject: r.subject,
        committedAt: r.committed_at, cost: r.cost ?? 0,
      })))
    }
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [db, limit])
  return rows
}
