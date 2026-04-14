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
