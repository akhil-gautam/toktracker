import { readFile, stat } from 'fs/promises'
import type { Session, ParseResult, ExtendedParseResult, ParsedMessage, ParsedToolCall } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

interface ClaudeCodeLine {
  type: string
  cwd?: string
  gitBranch?: string
  message?: {
    model?: string
    content?: Array<{ type?: string; name?: string }>
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

    // Extract tool_use calls from message content
    let toolUses: Record<string, number> | undefined
    if (Array.isArray(parsed.message.content)) {
      for (const part of parsed.message.content) {
        if (part?.type === 'tool_use' && part.name) {
          if (!toolUses) toolUses = {}
          toolUses[part.name] = (toolUses[part.name] ?? 0) + 1
        }
      }
    }

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
      toolUses,
    })
  }

  return { sessions, newOffset: fileStats.size }
}

export async function parseClaudeCodeExtended(filePath: string, fromOffset: number): Promise<ExtendedParseResult> {
  const raw = await readFile(filePath, 'utf8')
  const bytes = Buffer.byteLength(raw, 'utf8')
  const slice = fromOffset > 0 ? raw.slice(fromOffset) : raw
  const lines = slice.split('\n').filter(l => l.trim().length > 0)

  const sessions: Session[] = []
  const messages: ParsedMessage[] = []
  const toolCalls: ParsedToolCall[] = []

  let currentSessionId: string | null = null
  let turnIndex = 0

  for (const line of lines) {
    if (!line.includes('"type"')) continue
    let obj: any
    try { obj = JSON.parse(line) } catch { continue }

    if (obj.sessionId && obj.sessionId !== currentSessionId) {
      currentSessionId = obj.sessionId
      turnIndex = 0
    }
    if (!currentSessionId) continue

    if (obj.type === 'user' && obj.message?.content) {
      messages.push({
        sessionId: currentSessionId,
        turnIndex,
        role: 'user',
        content: extractText(obj.message.content),
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
    }
    if (obj.type === 'assistant' && obj.message?.content) {
      const content = obj.message.content
      messages.push({
        sessionId: currentSessionId,
        turnIndex,
        role: 'assistant',
        content: extractText(content),
        inputTokens: obj.message?.usage?.input_tokens,
        outputTokens: obj.message?.usage?.output_tokens,
        cacheRead: obj.message?.usage?.cache_read_input_tokens,
        cacheWrite: obj.message?.usage?.cache_creation_input_tokens,
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
      for (const block of Array.isArray(content) ? content : []) {
        if (block?.type === 'tool_use') {
          toolCalls.push({
            sessionId: currentSessionId,
            turnIndex,
            toolName: block.name,
            argsRaw: block.input,
            createdAt: new Date(obj.timestamp ?? Date.now()),
          })
        }
      }
      turnIndex += 1
    }
  }

  // Derive sessions from existing parser to preserve shape
  const base = await parseClaudeCode(filePath, fromOffset)
  sessions.push(...base.sessions)

  return { sessions, newOffset: bytes, messages, toolCalls }
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => (typeof b === 'string' ? b : (b as any)?.text ?? '')).join('\n')
  }
  return ''
}
