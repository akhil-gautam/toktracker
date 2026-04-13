import { readFile, stat } from 'fs/promises'
import { createHash } from 'crypto'
import type { Session, ParseResult } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

interface ClaudeCodeLine {
  parentUuid?: string | null
  sessionId?: string
  type: string
  cwd?: string
  gitBranch?: string
  message?: {
    model?: string
    role?: string
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

export async function parseClaudeCode(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) {
    return { sessions: [], newOffset: fromOffset }
  }

  const buffer = await readFile(filePath)
  const content = buffer.subarray(fromOffset).toString('utf-8')
  const lines = content.split('\n').filter(line => line.trim().length > 0)

  const sessions: Session[] = []

  for (const line of lines) {
    let parsed: ClaudeCodeLine
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }

    if (parsed.type !== 'assistant' || !parsed.message?.usage) continue

    const usage = parsed.message.usage
    const inputTokens = usage.input_tokens ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0
    const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0
    const model = parsed.message.model ?? 'unknown'

    const id = createHash('sha256')
      .update(`${filePath}:${parsed.uuid ?? parsed.timestamp}`)
      .digest('hex')
      .slice(0, 16)

    sessions.push({
      id: `cc-${id}`,
      tool: 'claude_code',
      model,
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      reasoningTokens: 0,
      costMillicents: calculateCostMillicents({
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
      }),
      cwd: parsed.cwd,
      gitBranch: parsed.gitBranch,
      startedAt: new Date(parsed.timestamp ?? Date.now()),
    })
  }

  return { sessions, newOffset: fileStats.size }
}
