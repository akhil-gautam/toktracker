import type Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_PATH = join(here, 'schema.sql')
const TARGET_VERSION = 1

export interface MigrateOptions {
  legacyDir?: string
}

export function migrate(db: Database.Database, opts: MigrateOptions = {}): void {
  const sql = readFileSync(SCHEMA_PATH, 'utf8')
  db.exec(sql)
  // Additive migrations for DBs created before the columns existed. Safe to
  // run every boot: each check is idempotent via PRAGMA lookup.
  ensureColumn(db, 'git_events', 'title', 'TEXT')
  ensureColumn(db, 'git_events', 'subject', 'TEXT')
  ensureColumn(db, 'git_events', 'committed_at', 'INTEGER')
  const row = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }
  const current = row.v ?? 0
  if (current < TARGET_VERSION) {
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(TARGET_VERSION, Date.now())
  }
  if (opts.legacyDir) importLegacy(db, opts.legacyDir)
}

function ensureColumn(db: Database.Database, table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some(c => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}

function importLegacy(db: Database.Database, dir: string): void {
  const budgets = join(dir, 'budgets.json')
  if (existsSync(budgets)) {
    const data = JSON.parse(readFileSync(budgets, 'utf8'))
    db.prepare(`INSERT OR REPLACE INTO feature_flags (key, enabled, config_json) VALUES ('legacy_budgets', 1, ?)`).run(JSON.stringify(data))
  }
  const state = join(dir, 'state.json')
  if (existsSync(state)) {
    const data = JSON.parse(readFileSync(state, 'utf8'))
    db.prepare(`INSERT OR REPLACE INTO feature_flags (key, enabled, config_json) VALUES ('legacy_cursors', 1, ?)`).run(JSON.stringify(data))
  }
}
