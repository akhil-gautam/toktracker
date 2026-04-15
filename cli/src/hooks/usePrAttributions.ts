import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { PrAttributionsRepo } from '../db/repository.js'

export interface PrSummary {
  repo: string
  prNumber: number
  costCents: number
  sessions: number
}

export function usePrAttributions(db: Database.Database): PrSummary[] {
  const [rows, setRows] = useState<PrSummary[]>([])
  useEffect(() => {
    const load = () => {
      const groups = db.prepare(`
        SELECT repo, pr_number, COUNT(*) as sessions
        FROM pr_attributions GROUP BY repo, pr_number ORDER BY pr_number DESC LIMIT 100
      `).all() as Array<{ repo: string; pr_number: number; sessions: number }>
      const repo = new PrAttributionsRepo(db)
      setRows(groups.map(g => ({
        repo: g.repo, prNumber: g.pr_number, sessions: g.sessions,
        costCents: repo.totalCostCentsForPr(g.repo, g.pr_number),
      })))
    }
    load()
    const id = setInterval(load, 30_000)
    return () => clearInterval(id)
  }, [db])
  return rows
}
