import { describe, it, expect } from 'vitest'
import { parseCodex } from '../src/parsers/codex.js'
import { parseCodexExtended } from '../src/parsers/codex.js'
import { fileURLToPath } from 'url'
import path from 'path'
import { join } from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'codex.jsonl')

describe('Codex parser', () => {
  it('parses token_count events into sessions', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions.length).toBe(2)
  })

  it('uses last_token_usage for per-turn counts', async () => {
    const result = await parseCodex(fixturePath, 0)
    const second = result.sessions[1]
    expect(second.inputTokens).toBe(10000)
    expect(second.outputTokens).toBe(600)
    expect(second.cacheReadTokens).toBe(5000)
    expect(second.reasoningTokens).toBe(50)
  })

  it('extracts model from turn_context', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions[0].model).toBe('gpt-4.1')
    expect(result.sessions[1].model).toBe('gpt-4.1')
  })

  it('extracts git info from session_meta', async () => {
    const result = await parseCodex(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.cwd).toBe('/Users/dev/my-project')
    expect(first.gitBranch).toBe('main')
    expect(first.gitRepo).toBe('dev/my-project')
  })

  it('sets tool to codex and provider to openai', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions[0].tool).toBe('codex')
    expect(result.sessions[0].provider).toBe('openai')
  })

  it('calculates cost', async () => {
    const result = await parseCodex(fixturePath, 0)
    expect(result.sessions[0].costMillicents).toBeGreaterThan(0)
  })

  it('returns newOffset for incremental reads', async () => {
    const first = await parseCodex(fixturePath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseCodex(fixturePath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })
})

describe('codex ExtendedParseResult', () => {
  it('emits messages for a fixture session', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'codex', 'basic.jsonl')
    const result = await parseCodexExtended(fixture, 0)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
