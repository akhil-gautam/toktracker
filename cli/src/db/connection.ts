import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let instance: Database.Database | null = null
let currentPath: string | null = null

export function getDb(path: string): Database.Database {
  if (instance && currentPath === path) return instance
  if (instance) instance.close()
  mkdirSync(dirname(path), { recursive: true })
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  instance = db
  currentPath = path
  return db
}

export function closeDb(): void {
  if (instance) {
    instance.close()
    instance = null
    currentPath = null
  }
}
