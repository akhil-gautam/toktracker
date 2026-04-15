import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { SessionsRepo, MessagesRepo } from '../../src/db/repository.js'
import { RedactionRulesRepo } from '../../src/redaction/repository.js'
import { backfill } from '../../src/capture/backfill.js'

const tmp = join(tmpdir(), `tokscale-backfill-${Date.now()}`)
mkdirSync(tmp, { recursive: true })
const dbPath = join(tmp, 'db.sqlite')

beforeEach(() => { const db = getDb(dbPath); migrate(db); new RedactionRulesRepo(db).seedBuiltins() })
afterEach(() => { closeDb(); try { rmSync(tmp, { recursive: true }) } catch {} })

describe('backfill', () => {
  it('imports sessions + messages from a claude_code fixture dir', async () => {
    const fixture = join(tmp, 'claude', 'session.jsonl')
    mkdirSync(join(tmp, 'claude'), { recursive: true })
    const payload = [
      { type: 'user', sessionId: 'sess-A', timestamp: '2026-04-01T00:00:00Z', message: { content: 'hello' } },
      { type: 'assistant', sessionId: 'sess-A', timestamp: '2026-04-01T00:00:05Z', message: { content: 'hi', usage: { input_tokens: 10, output_tokens: 5 } } },
    ].map(o => JSON.stringify(o)).join('\n')
    writeFileSync(fixture, payload)

    const db = getDb(dbPath)
    new SessionsRepo(db).upsert({ id: 'sess-A', tool: 'claude_code', model: 'claude-opus-4-6', startedAt: Date.parse('2026-04-01T00:00:00Z') })

    const result = await backfill(db, 'claude_code', fixture)
    expect(result.messagesInserted).toBeGreaterThanOrEqual(2)
    expect(new MessagesRepo(db).findBySession('sess-A').length).toBeGreaterThanOrEqual(2)
  })
})
