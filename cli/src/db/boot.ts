import type Database from 'better-sqlite3'
import { getDb } from './connection.js'
import { migrate } from './migrate.js'
import { RedactionRulesRepo } from '../redaction/repository.js'
import { dbPath, configDir } from './paths.js'

export function bootDb(overridePath?: string): Database.Database {
  const db = getDb(overridePath ?? dbPath())
  migrate(db, { legacyDir: configDir() })
  new RedactionRulesRepo(db).seedBuiltins()
  return db
}
