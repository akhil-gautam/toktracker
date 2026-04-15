import { describe, it, expect } from 'vitest'
import { parseGeminiCli } from '../src/parsers/gemini-cli.js'
import { parseGeminiExtended } from '../src/parsers/gemini-cli.js'
import { fileURLToPath } from 'url'
import path from 'path'
import { join } from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturePath = path.join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'gemini-session.json')

describe('Gemini CLI parser', () => {
  it('parses assistant messages from session JSON', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions.length).toBe(2)
  })
  it('estimates tokens from message text length', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].outputTokens).toBeGreaterThan(0)
    expect(result.sessions[0].inputTokens).toBeGreaterThan(0)
  })
  it('marks sessions as estimated', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].estimated).toBe(true)
  })
  it('sets tool to gemini_cli', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].tool).toBe('gemini_cli')
  })
  it('defaults model to gemini-2.5-pro', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].model).toBe('gemini-2.5-pro')
  })
  it('extracts timestamps', async () => {
    const result = await parseGeminiCli(fixturePath, 0)
    expect(result.sessions[0].startedAt).toEqual(new Date('2026-04-13T08:00:30.000Z'))
  })
  it('returns file size as newOffset', async () => {
    const first = await parseGeminiCli(fixturePath, 0)
    expect(first.newOffset).toBeGreaterThan(0)
    const second = await parseGeminiCli(fixturePath, first.newOffset)
    expect(second.sessions.length).toBe(0)
  })
})

describe('gemini ExtendedParseResult', () => {
  it('emits messages for a fixture chat JSON', async () => {
    const fixture = join(__dirname, '..', 'src', 'parsers', '__fixtures__', 'gemini', 'basic.json')
    const result = await parseGeminiExtended(fixture, 0)
    expect(result.messages.length).toBeGreaterThan(0)
  })
})
