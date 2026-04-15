import type Database from 'better-sqlite3'
import { MessagesRepo, ToolCallsRepo } from '../db/repository.js'
import { RedactionRulesRepo } from '../redaction/repository.js'
import { Redactor } from '../redaction/pipeline.js'
import { sha256, normalizeArgs, extractTargetPath } from './hashing.js'

export interface RecordMessageInput {
  sessionId: string
  turnIndex: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
  createdAt: Date
}

export interface RecordMessageResult {
  id: number
  contentHash: string
}

export interface RecordToolCallInput {
  messageId: number
  sessionId: string
  turnIndex: number
  toolName: string
  argsRaw: unknown
  succeeded?: boolean
  tokensReturned?: number
  createdAt: Date
}

export interface RecordToolCallResult {
  id: number
  argsHash: string
}

export class MessageRecorder {
  private redactor: Redactor
  private messages: MessagesRepo
  private toolCalls: ToolCallsRepo

  constructor(db: Database.Database) {
    this.redactor = new Redactor(new RedactionRulesRepo(db).all())
    this.messages = new MessagesRepo(db)
    this.toolCalls = new ToolCallsRepo(db)
  }

  recordMessage(input: RecordMessageInput): RecordMessageResult {
    const redacted = this.redactor.apply(input.content)
    const hash = sha256(redacted)
    const row = this.messages.insert({
      sessionId: input.sessionId, turnIndex: input.turnIndex, role: input.role,
      contentHash: hash, contentRedacted: redacted,
      inputTokens: input.inputTokens, outputTokens: input.outputTokens,
      cacheRead: input.cacheRead, cacheWrite: input.cacheWrite, thinkingTokens: input.thinkingTokens,
      createdAt: input.createdAt.getTime(),
    })
    return { id: row.id!, contentHash: hash }
  }

  recordToolCall(input: RecordToolCallInput): RecordToolCallResult {
    const normalized = normalizeArgs(input.argsRaw)
    const redacted = this.redactor.apply(normalized)
    const hash = sha256(redacted)
    const row = this.toolCalls.insert({
      messageId: input.messageId, sessionId: input.sessionId,
      toolName: input.toolName, argsHash: hash, argsJson: redacted,
      targetPath: extractTargetPath(input.toolName, input.argsRaw),
      succeeded: input.succeeded == null ? null : (input.succeeded ? 1 : 0),
      tokensReturned: input.tokensReturned ?? 0,
      createdAt: input.createdAt.getTime(),
    })
    return { id: row.id!, argsHash: hash }
  }
}
