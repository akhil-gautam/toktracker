import { readFile, stat } from 'fs/promises'
import { createHash } from 'crypto'
import type { Session, ParseResult } from '../types.js'
import { calculateCostMillicents } from '../services/cost-calculator.js'

const DEFAULT_MODEL = 'gemini-2.5-pro'
const CHARS_PER_TOKEN = 4

interface GeminiMessage {
  id: string; timestamp: string; type: string
  content: string | Array<{ text: string }>
}
interface GeminiSession {
  sessionId: string; startTime: string; lastUpdated: string; messages: GeminiMessage[]
}

function getMessageText(content: string | Array<{ text: string }>): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(c => c.text ?? '').join('\n')
  return ''
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export async function parseGeminiCli(filePath: string, fromOffset: number): Promise<ParseResult> {
  const fileStats = await stat(filePath)
  if (fromOffset >= fileStats.size) return { sessions: [], newOffset: fromOffset }

  const content = await readFile(filePath, 'utf-8')
  let parsed: GeminiSession
  try { parsed = JSON.parse(content) } catch { return { sessions: [], newOffset: fileStats.size } }

  const sessions: Session[] = []
  let cumulativeInputText = ''

  for (const msg of parsed.messages) {
    if (msg.type === 'user') { cumulativeInputText += getMessageText(msg.content) + '\n'; continue }
    if (msg.type !== 'assistant') continue

    const outputText = getMessageText(msg.content)
    const outputTokens = estimateTokens(outputText)
    const inputTokens = estimateTokens(cumulativeInputText)
    cumulativeInputText += outputText + '\n'

    const id = createHash('sha256').update(`${filePath}:${msg.id}`).digest('hex').slice(0, 16)
    sessions.push({
      id: `gem-${id}`, tool: 'gemini_cli', model: DEFAULT_MODEL, provider: 'google',
      inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
      costMillicents: calculateCostMillicents({ model: DEFAULT_MODEL, inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 }),
      startedAt: new Date(msg.timestamp), estimated: true,
    })
  }
  return { sessions, newOffset: fileStats.size }
}
