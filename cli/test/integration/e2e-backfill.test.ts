import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../src/db/repository.js'
import { RedactionRulesRepo } from '../../src/redaction/repository.js'
import { backfill } from '../../src/capture/backfill.js'

const dir = join(tmpdir(), `tokscale-bf-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const dbPath = join(dir, 'd.db')

afterEach(() => { closeDb(); try { rmSync(dir, { recursive: true }) } catch {} })

describe('E2E backfill', () => {
  it('ingests a small JSONL and exposes messages for rule queries', async () => {
    const db = getDb(dbPath); migrate(db); new RedactionRulesRepo(db).seedBuiltins()
    new SessionsRepo(db).upsert({ id: 'S', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: 1 })
    const file = join(dir, 's.jsonl')
    writeFileSync(file, [
      { type: 'user', sessionId: 'S', timestamp: '2026-04-10T00:00:00Z', message: { content: 'hi' } },
      { type: 'assistant', sessionId: 'S', timestamp: '2026-04-10T00:00:05Z', message: { content: 'hello', usage: { input_tokens: 10, output_tokens: 5 } } },
    ].map(o => JSON.stringify(o)).join('\n'))
    const r = await backfill(db, 'claude_code', file)
    expect(r.messagesInserted).toBeGreaterThanOrEqual(2)
    expect(new MessagesRepo(db).findBySession('S').length).toBeGreaterThanOrEqual(2)
  })
})
