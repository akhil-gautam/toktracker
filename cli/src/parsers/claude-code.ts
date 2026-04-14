import { readFile, stat } from 'fs/promises'
import type { Session, ParseResult } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

interface ClaudeCodeLine {
  type: string
  cwd?: string
  gitBranch?: string
  message?: {
    model?: string
    usage?: {
      input_tokens?: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
      output_tokens?: number
    }
  }
  uuid?: string
  timestamp?: string
}

// Fast pre-filter: only parse lines that could be assistant messages with usage data
const ASSISTANT_MARKER = '"type":"assistant"'
const USAGE_MARKER = '"usage"'

export async function parseClaudeCode(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) {
    return { sessions: [], newOffset: fromOffset }
  }

  const buffer = await readFile(filePath)
  const content = buffer.subarray(fromOffset).toString('utf-8')

  const sessions: Session[] = []
  let lineStart = 0
  let lineIdx = 0

  while (lineStart < content.length) {
    const lineEnd = content.indexOf('\n', lineStart)
    const end = lineEnd === -1 ? content.length : lineEnd
    const line = content.substring(lineStart, end)
    lineStart = end + 1

    // Skip lines that can't be assistant messages with usage — avoids JSON.parse on ~80% of lines
    if (!line.includes(ASSISTANT_MARKER) || !line.includes(USAGE_MARKER)) continue

    let parsed: ClaudeCodeLine
    try { parsed = JSON.parse(line) } catch { continue }

    if (parsed.type !== 'assistant' || !parsed.message?.usage) continue

    const usage = parsed.message.usage
    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
    const model = parsed.message.model ?? 'unknown'

    sessions.push({
      id: `cc-${filePath.length}-${lineIdx++}-${parsed.uuid ?? parsed.timestamp ?? lineStart}`,
      tool: 'claude_code',
      model,
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens: 0,
      costMillicents: calculateCostMillicents({
        model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
      }),
      cwd: parsed.cwd,
      gitBranch: parsed.gitBranch,
      startedAt: new Date(parsed.timestamp ?? Date.now()),
    })
  }

  return { sessions, newOffset: fileStats.size }
}
