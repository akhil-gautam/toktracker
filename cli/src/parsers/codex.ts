import { readFile, stat } from 'fs/promises'
import type { Session, ParseResult, ExtendedParseResult, ParsedMessage, ParsedToolCall } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

interface CodexSessionMeta {
  id: string
  cwd: string
  model_provider: string
  git?: { commit_hash?: string; branch?: string; repository_url?: string }
}

interface CodexLine {
  timestamp: string
  type: string
  payload: {
    id?: string; cwd?: string; model_provider?: string
    git?: { commit_hash?: string; branch?: string; repository_url?: string }
    turn_id?: string; model?: string
    type?: string
    info?: {
      last_token_usage?: {
        input_tokens: number; cached_input_tokens: number
        output_tokens: number; reasoning_output_tokens: number; total_tokens: number
      }
    }
  }
}

function extractRepoFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1]
}

export async function parseCodex(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) return { sessions: [], newOffset: fromOffset }

  const buffer = await readFile(filePath)
  const content = buffer.subarray(fromOffset).toString('utf-8')
  const lines = content.split('\n').filter(line => line.trim().length > 0)

  const sessions: Session[] = []
  let meta: CodexSessionMeta | null = null
  let currentModel = 'unknown'

  for (const line of lines) {
    let parsed: CodexLine
    try { parsed = JSON.parse(line) } catch { continue }

    if (parsed.type === 'session_meta') {
      meta = { id: parsed.payload.id ?? 'unknown', cwd: parsed.payload.cwd ?? '', model_provider: parsed.payload.model_provider ?? 'openai', git: parsed.payload.git }
      continue
    }
    if (parsed.type === 'turn_context' && parsed.payload.model) {
      currentModel = parsed.payload.model
      continue
    }
    if (parsed.type === 'event_msg' && parsed.payload.type === 'token_count') {
      const usage = parsed.payload.info?.last_token_usage
      if (!usage) continue
      const id = `${filePath.length}-${sessions.length}-${parsed.timestamp}`
      sessions.push({
        id: `codex-${id}`, tool: 'codex', model: currentModel,
        provider: meta?.model_provider ?? 'openai',
        inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cached_input_tokens, cacheWriteTokens: 0,
        reasoningTokens: usage.reasoning_output_tokens,
        costMillicents: calculateCostMillicents({
          model: currentModel,
          inputTokens: usage.input_tokens - usage.cached_input_tokens,
          outputTokens: usage.output_tokens,
          cacheReadTokens: usage.cached_input_tokens, cacheWriteTokens: 0,
        }),
        cwd: meta?.cwd, gitRepo: extractRepoFromUrl(meta?.git?.repository_url),
        gitBranch: meta?.git?.branch, startedAt: new Date(parsed.timestamp),
      })
    }
  }
  return { sessions, newOffset: fileStats.size }
}

export async function parseCodexExtended(filePath: string, fromOffset: number): Promise<ExtendedParseResult> {
  const raw = await readFile(filePath, 'utf8')
  const bytes = Buffer.byteLength(raw, 'utf8')
  const slice = fromOffset > 0 ? raw.slice(fromOffset) : raw

  const sessions: Session[] = []
  const messages: ParsedMessage[] = []
  const toolCalls: ParsedToolCall[] = []
  let currentSessionId: string | null = null
  let turnIndex = 0

  for (const line of slice.split('\n').filter(l => l.trim())) {
    let obj: any
    try { obj = JSON.parse(line) } catch { continue }
    const kind = obj.type ?? obj.event ?? obj.kind
    if (kind === 'session_meta') {
      // support both obj.session_id and obj.payload.id
      const sid = obj.session_id ?? obj.payload?.id
      if (sid) { currentSessionId = sid; turnIndex = 0 }
    }
    // for message-type lines that carry session_id directly
    if (!currentSessionId && obj.session_id) {
      currentSessionId = obj.session_id
    }
    if (!currentSessionId) continue
    if (kind === 'event_msg' || kind === 'message') {
      const role = obj.role ?? (obj.sender === 'user' ? 'user' : 'assistant')
      messages.push({
        sessionId: currentSessionId,
        turnIndex,
        role: role === 'user' ? 'user' : 'assistant',
        content: String(obj.content ?? obj.text ?? ''),
        inputTokens: obj.usage?.input_tokens,
        outputTokens: obj.usage?.output_tokens,
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
      if (role !== 'user') turnIndex += 1
    }
    if (kind === 'tool_call' && obj.tool_name) {
      toolCalls.push({
        sessionId: currentSessionId,
        turnIndex,
        toolName: obj.tool_name,
        argsRaw: obj.arguments ?? obj.input ?? {},
        succeeded: obj.status === 'success',
        createdAt: new Date(obj.timestamp ?? Date.now()),
      })
    }
  }

  const base = await parseCodex(filePath, fromOffset)
  sessions.push(...base.sessions)
  return { sessions, newOffset: bytes, messages, toolCalls }
}
