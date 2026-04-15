import { describe, it, expect } from 'vitest'
import { parseClaudeCode } from '../src/parsers/claude-code.js'
import { parseClaudeCodeExtended } from '../src/parsers/claude-code.js'
import { fileURLToPath } from 'url'
import path from 'path'
import { join } from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'claude-code.jsonl')

describe('Claude Code parser', () => {
  it('parses assistant messages with token usage', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    expect(result.sessions.length).toBe(3)
  })

  it('extracts correct token counts from first assistant message', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.inputTokens).toBe(100)
    expect(first.outputTokens).toBe(30)
    expect(first.cacheReadTokens).toBe(200)
    expect(first.cacheWriteTokens).toBe(50)
    expect(first.model).toBe('claude-sonnet-4-6')
    expect(first.tool).toBe('claude_code')
  })

  it('extracts cwd and git branch', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.cwd).toBe('/Users/dev/my-project')
    expect(first.gitBranch).toBe('main')
  })

  it('extracts different session from second conversation', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const third = result.sessions[2]
    expect(third.model).toBe('claude-opus-4-6')
    expect(third.cwd).toBe('/Users/dev/other-project')
    expect(third.gitBranch).toBe('feat/new')
    expect(third.inputTokens).toBe(2000)
  })

  it('calculates cost in millicents', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.costMillicents).toBeGreaterThan(0)
  })

  it('returns newOffset for incremental reads', async () => {
    const first = await parseClaudeCode(fixturePath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseClaudeCode(fixturePath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })

  it('sets timestamps correctly', async () => {
    const result = await parseClaudeCode(fixturePath, 0)
    const first = result.sessions[0]
    expect(first.startedAt).toEqual(new Date('2026-04-13T08:00:05.000Z'))
  })
})

describe('claude-code ExtendedParseResult', () => {
  it('emits messages + tool calls for a fixture JSONL', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'claude-code', 'basic.jsonl')
    const result = await parseClaudeCodeExtended(fixture, 0)
    expect(result.sessions.length).toBeGreaterThan(0)
    expect(result.messages.length).toBeGreaterThan(0)
    const toolUses = result.toolCalls.filter(t => t.toolName === 'Read')
    if (toolUses.length > 0) {
      expect(toolUses[0].targetPath).toBeTruthy()
    }
  })
})
