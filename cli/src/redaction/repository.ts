import type Database from 'better-sqlite3'
import { BUILTIN_REDACTION_RULES } from './builtins.js'
import type { RedactionRule } from './pipeline.js'

export class RedactionRulesRepo {
  constructor(private db: Database.Database) {}
  seedBuiltins(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM redaction_rules WHERE builtin = 1').get() as { c: number }).c
    if (count > 0) return
    const stmt = this.db.prepare('INSERT INTO redaction_rules (pattern, replacement, enabled, builtin, created_at) VALUES (?, ?, ?, ?, ?)')
    const now = Date.now()
    for (const r of BUILTIN_REDACTION_RULES) stmt.run(r.pattern, r.replacement, r.enabled, r.builtin, now)
  }
  all(): RedactionRule[] {
    return this.db.prepare('SELECT id, pattern, replacement, enabled, builtin FROM redaction_rules ORDER BY id').all() as RedactionRule[]
  }
  add(pattern: string, replacement = '[REDACTED]'): RedactionRule {
    const info = this.db.prepare('INSERT INTO redaction_rules (pattern, replacement, enabled, builtin, created_at) VALUES (?, ?, 1, 0, ?)').run(pattern, replacement, Date.now())
    return { id: Number(info.lastInsertRowid), pattern, replacement, enabled: 1, builtin: 0 }
  }
  remove(id: number): void {
    this.db.prepare('DELETE FROM redaction_rules WHERE id = ? AND builtin = 0').run(id)
  }
  setEnabled(id: number, enabled: boolean): void {
    this.db.prepare('UPDATE redaction_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }
}
