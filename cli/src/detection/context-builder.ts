import type Database from 'better-sqlite3'
import type { DetectionContext, Trigger } from './types.js'

export interface HookPayload {
  session_id?: string
  hook_event_name: string
  tool_name?: string
  tool_input?: unknown
  tool_response?: unknown
  prompt?: string
  [key: string]: unknown
}

const TRIGGER_MAP: Record<string, Trigger> = {
  PreToolUse: 'PreToolUse',
  PostToolUse: 'PostToolUse',
  UserPromptSubmit: 'UserPromptSubmit',
  Stop: 'Stop',
}

export function buildHookContext(db: Database.Database, payload: HookPayload): DetectionContext {
  const trigger = TRIGGER_MAP[payload.hook_event_name] ?? 'PostToolUse'
  return {
    db,
    trigger,
    sessionId: payload.session_id,
    toolName: payload.tool_name,
    toolInput: payload.tool_input,
    toolOutput: payload.tool_response,
    userPrompt: payload.prompt,
    timestamp: Date.now(),
    thresholds: {},
    hardBlockEnabled: true,
    now: () => Date.now(),
  }
}
