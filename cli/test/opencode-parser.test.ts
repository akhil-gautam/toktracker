import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { parseOpenCode } from '../src/parsers/opencode.js'
import { parseOpencodeExtended } from '../src/parsers/opencode.js'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const seedSQL = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'opencode-seed.sql')

describe('OpenCode parser', () => {
  let dbPath: string
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'opencode-test-'))
    dbPath = path.join(tempDir, 'opencode.db')
    const db = new Database(dbPath)
    db.exec(readFileSync(seedSQL, 'utf-8'))
    db.close()
  })

  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }) })

  it('parses assistant messages with token data', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions.length).toBe(2)
  })
  it('extracts token counts from message data', async () => {
    const result = await parseOpenCode(dbPath, 0)
    const first = result.sessions[0]
    expect(first.inputTokens).toBe(10791)
    expect(first.outputTokens).toBe(987)
    expect(first.cacheReadTokens).toBe(5000)
    expect(first.cacheWriteTokens).toBe(200)
  })
  it('uses direct cost from OpenCode when available', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[0].costMillicents).toBe(4500)
  })
  it('extracts model and provider', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[0].model).toBe('google/gemini-3.1-pro-preview')
    expect(result.sessions[0].provider).toBe('openrouter')
  })
  it('extracts cwd from session directory', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[0].cwd).toBe('/Users/dev/my-project')
  })
  it('sets tool to opencode', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[0].tool).toBe('opencode')
  })
  it('uses timestamp as cursor for incremental reads', async () => {
    const first = await parseOpenCode(dbPath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseOpenCode(dbPath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })
  it('extracts reasoning tokens', async () => {
    const result = await parseOpenCode(dbPath, 0)
    expect(result.sessions[1].reasoningTokens).toBe(100)
  })
})

describe('opencode ExtendedParseResult', () => {
  it('reads messages + tool calls from SQLite fixture', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'opencode', 'opencode.db')
    const result = await parseOpencodeExtended(fixture, 0)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
