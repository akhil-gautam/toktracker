export type Tool = 'claude_code' | 'codex' | 'opencode' | 'gemini_cli'

export interface Session {
  id: string
  tool: Tool
  model: string
  provider: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  costMillicents: number
  cwd?: string
  gitRepo?: string
  gitBranch?: string
  startedAt: Date
  endedAt?: Date
  estimated?: boolean
  toolUses?: Record<string, number>  // e.g. { Read: 2, Grep: 1, Bash: 3 }
}

export interface ParseResult {
  sessions: Session[]
  newOffset: number
}

export interface Parser {
  name: string
  tool: Tool
  globPattern: string
  parse(filePath: string, fromOffset: number): Promise<ParseResult>
}

export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion: number
  cacheWritePerMillion: number
}

export interface PricingMap {
  [model: string]: ModelPricing
}

export interface Budget {
  id: string
  scope: 'global' | 'project' | 'repo'
  scopeValue?: string
  period: 'daily' | 'weekly' | 'monthly'
  limitCents: number
  alertAtPct: number
}

export interface CursorState {
  cursors: Record<string, number>
  lastSync?: string
}

export interface DayStats {
  date: string
  costMillicents: number
  inputTokens: number
  outputTokens: number
  sessionCount: number
}

export interface ModelStats {
  model: string
  costMillicents: number
  inputTokens: number
  outputTokens: number
  sessionCount: number
}

export interface ToolStats {
  tool: Tool
  costMillicents: number
  sessionCount: number
}

export interface RepoStats {
  repo: string
  costMillicents: number
  sessionCount: number
  models: string[]
}

export interface TodayDetailStats {
  costMillicents: number
  sessionCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  models: ModelStats[]
  tools: ToolStats[]
  repos: RepoStats[]
  hourly: number[]  // 24 entries, cost per hour
  firstSession?: Date
  lastSession?: Date
}

export interface ModelDetailStats {
  model: string
  costMillicents: number
  sessionCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  maxInputTokens: number             // peak single-session input
  avgInputTokens: number
  contextWindow: number              // for this model
  tools: Array<{ tool: string; costMillicents: number; sessionCount: number }>
  repos: Array<{ repo: string; costMillicents: number; sessionCount: number }>
  dailyTrend: number[]               // 30-day cost trend
  toolUses: Array<{ name: string; count: number }>  // Claude Code tool calls: Read, Grep, etc.
}

export interface RepoDetailStats {
  repo: string
  costMillicents: number
  sessionCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  models: Array<{ model: string; costMillicents: number; sessionCount: number }>
  tools: Array<{ tool: string; costMillicents: number; sessionCount: number }>
  branches: Array<{ branch: string; costMillicents: number; sessionCount: number }>
  dailyTrend: number[]   // 30-day cost trend
  firstSession?: Date
  lastSession?: Date
  activeDays: number
}

export interface AllTimeStats {
  costMillicents: number
  sessionCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  reasoningTokens: number
  uniqueModels: number
  uniqueTools: number
  uniqueRepos: number
  activeDays: number  // days with at least one session
  cacheReuseRatio: number  // 0-1
}

export interface ParsedMessage {
  sessionId: string
  turnIndex: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string              // raw text, will be redacted before persist
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
  createdAt: Date
}

export interface ParsedToolCall {
  sessionId: string
  turnIndex: number            // the assistant turn that invoked the tool
  toolName: string
  argsRaw: unknown             // will be JSON.stringify'd then redacted + hashed
  targetPath?: string          // extracted when tool is Read/Write/Edit/Grep etc.
  succeeded?: boolean
  tokensReturned?: number
  createdAt: Date
}

export interface ExtendedParseResult extends ParseResult {
  messages: ParsedMessage[]
  toolCalls: ParsedToolCall[]
}
