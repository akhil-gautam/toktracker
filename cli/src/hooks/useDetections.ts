import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { DetectionsRepo, type DetectionRow } from '../db/repository.js'

export function useDetections(db: Database.Database, limit = 50): DetectionRow[] {
  const [rows, setRows] = useState<DetectionRow[]>([])
  useEffect(() => {
    const load = () => setRows(new DetectionsRepo(db).recent(limit))
    load()
    const id = setInterval(load, 2000)
    return () => clearInterval(id)
  }, [db, limit])
  return rows
}
