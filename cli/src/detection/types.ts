import type Database from 'better-sqlite3'

export type Trigger =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'PollTick'
  | 'GitEvent'
  | 'Nightly'

export type Category = 'A' | 'B' | 'C' | 'D'

export type Severity = 'info' | 'warn' | 'block'

export interface Detection {
  ruleId: string
  severity: Severity
  summary: string
  metadata?: Record<string, unknown>
  suggestedAction?: {
    kind: 'claude_md_edit' | 'save_command' | 'compact' | 'switch_model' | 'acknowledge_only'
    payload: Record<string, unknown>
  }
}

export interface DetectionContext {
  db: Database.Database
  trigger: Trigger
  sessionId?: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: unknown
  userPrompt?: string
  timestamp: number
  thresholds: Record<string, number>
  hardBlockEnabled: boolean
  now(): number
}

export interface Rule {
  id: string
  category: Category
  triggers: Trigger[]
  defaultSeverity: Severity
  hardBlockEligible: boolean
  defaultThresholds: Record<string, number>
  evaluate(ctx: DetectionContext): Promise<Detection | null> | Detection | null
}

export interface HookDecision {
  decision?: 'block'
  reason?: string
  additionalContext?: string
}
