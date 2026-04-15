import type Database from 'better-sqlite3'

export interface SessionRow {
  id: string
  tool: string
  model: string
  cwd?: string | null
  gitRepo?: string | null
  gitBranch?: string | null
  gitCommitStart?: string | null
  gitCommitEnd?: string | null
  startedAt: number
  endedAt?: number | null
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  costMillicents?: number
}

export class SessionsRepo {
  constructor(private db: Database.Database) {}
  upsert(s: SessionRow): void {
    this.db.prepare(`
      INSERT INTO sessions (id, tool, model, cwd, git_repo, git_branch, git_commit_start, git_commit_end,
        started_at, ended_at, input_tokens, output_tokens, cache_read, cache_write, cost_millicents)
      VALUES (@id, @tool, @model, @cwd, @gitRepo, @gitBranch, @gitCommitStart, @gitCommitEnd,
        @startedAt, @endedAt, @inputTokens, @outputTokens, @cacheRead, @cacheWrite, @costMillicents)
      ON CONFLICT(id) DO UPDATE SET
        ended_at = excluded.ended_at,
        input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens,
        cache_read = excluded.cache_read,
        cache_write = excluded.cache_write,
        cost_millicents = excluded.cost_millicents,
        git_commit_end = excluded.git_commit_end
    `).run({
      id: s.id, tool: s.tool, model: s.model,
      cwd: s.cwd ?? null, gitRepo: s.gitRepo ?? null, gitBranch: s.gitBranch ?? null,
      gitCommitStart: s.gitCommitStart ?? null, gitCommitEnd: s.gitCommitEnd ?? null,
      startedAt: s.startedAt, endedAt: s.endedAt ?? null,
      inputTokens: s.inputTokens ?? 0, outputTokens: s.outputTokens ?? 0,
      cacheRead: s.cacheRead ?? 0, cacheWrite: s.cacheWrite ?? 0,
      costMillicents: s.costMillicents ?? 0,
    })
  }
  findById(id: string): SessionRow | null {
    const r = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as any
    return r ? toSessionRow(r) : null
  }
  findInRange(sinceMs: number, untilMs: number): SessionRow[] {
    return (this.db.prepare('SELECT * FROM sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at').all(sinceMs, untilMs) as any[]).map(toSessionRow)
  }
}

function toSessionRow(r: any): SessionRow {
  return {
    id: r.id, tool: r.tool, model: r.model, cwd: r.cwd,
    gitRepo: r.git_repo, gitBranch: r.git_branch,
    gitCommitStart: r.git_commit_start, gitCommitEnd: r.git_commit_end,
    startedAt: r.started_at, endedAt: r.ended_at,
    inputTokens: r.input_tokens, outputTokens: r.output_tokens,
    cacheRead: r.cache_read, cacheWrite: r.cache_write, costMillicents: r.cost_millicents,
  }
}

export interface MessageRow {
  id?: number
  sessionId: string
  turnIndex: number
  role: string
  contentHash: string
  contentRedacted?: string | null
  inputTokens?: number
  outputTokens?: number
  cacheRead?: number
  cacheWrite?: number
  thinkingTokens?: number
  createdAt: number
}

export class MessagesRepo {
  constructor(private db: Database.Database) {}
  insert(m: MessageRow): MessageRow {
    const info = this.db.prepare(`
      INSERT INTO messages (session_id, turn_index, role, content_hash, content_redacted,
        input_tokens, output_tokens, cache_read, cache_write, thinking_tokens, created_at)
      VALUES (@sessionId, @turnIndex, @role, @contentHash, @contentRedacted,
        @inputTokens, @outputTokens, @cacheRead, @cacheWrite, @thinkingTokens, @createdAt)
    `).run({
      sessionId: m.sessionId, turnIndex: m.turnIndex, role: m.role,
      contentHash: m.contentHash, contentRedacted: m.contentRedacted ?? null,
      inputTokens: m.inputTokens ?? 0, outputTokens: m.outputTokens ?? 0,
      cacheRead: m.cacheRead ?? 0, cacheWrite: m.cacheWrite ?? 0,
      thinkingTokens: m.thinkingTokens ?? 0, createdAt: m.createdAt,
    })
    return { ...m, id: Number(info.lastInsertRowid) }
  }
  findBySession(sessionId: string): MessageRow[] {
    return (this.db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY turn_index').all(sessionId) as any[])
      .map(r => ({
        id: r.id, sessionId: r.session_id, turnIndex: r.turn_index, role: r.role,
        contentHash: r.content_hash, contentRedacted: r.content_redacted,
        inputTokens: r.input_tokens, outputTokens: r.output_tokens,
        cacheRead: r.cache_read, cacheWrite: r.cache_write,
        thinkingTokens: r.thinking_tokens, createdAt: r.created_at,
      }))
  }
  countByHashSince(contentHash: string, sinceMs: number): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM messages WHERE content_hash = ? AND created_at >= ?').get(contentHash, sinceMs) as { c: number }).c
  }
}

export interface ToolCallRow {
  id?: number
  messageId: number
  sessionId: string
  toolName: string
  argsHash: string
  argsJson?: string | null
  targetPath?: string | null
  succeeded?: number | null
  tokensReturned?: number
  createdAt: number
}

export class ToolCallsRepo {
  constructor(private db: Database.Database) {}
  insert(t: ToolCallRow): ToolCallRow {
    const info = this.db.prepare(`
      INSERT INTO tool_calls (message_id, session_id, tool_name, args_hash, args_json,
        target_path, succeeded, tokens_returned, created_at)
      VALUES (@messageId, @sessionId, @toolName, @argsHash, @argsJson,
        @targetPath, @succeeded, @tokensReturned, @createdAt)
    `).run({
      messageId: t.messageId, sessionId: t.sessionId, toolName: t.toolName,
      argsHash: t.argsHash, argsJson: t.argsJson ?? null,
      targetPath: t.targetPath ?? null, succeeded: t.succeeded ?? null,
      tokensReturned: t.tokensReturned ?? 0, createdAt: t.createdAt,
    })
    return { ...t, id: Number(info.lastInsertRowid) }
  }
  findBySessionToolArgs(sessionId: string, toolName: string, argsHash: string): ToolCallRow[] {
    return (this.db.prepare(
      'SELECT * FROM tool_calls WHERE session_id = ? AND tool_name = ? AND args_hash = ? ORDER BY created_at'
    ).all(sessionId, toolName, argsHash) as any[]).map(r => ({
      id: r.id, messageId: r.message_id, sessionId: r.session_id, toolName: r.tool_name,
      argsHash: r.args_hash, argsJson: r.args_json, targetPath: r.target_path,
      succeeded: r.succeeded, tokensReturned: r.tokens_returned, createdAt: r.created_at,
    }))
  }
  countDistinctSessionsForPath(targetPath: string, sinceMs: number): number {
    return (this.db.prepare('SELECT COUNT(DISTINCT session_id) as c FROM tool_calls WHERE target_path = ? AND created_at >= ?').get(targetPath, sinceMs) as { c: number }).c
  }
  failedCountInSession(sessionId: string): number {
    return (this.db.prepare('SELECT COUNT(*) as c FROM tool_calls WHERE session_id = ? AND succeeded = 0').get(sessionId) as { c: number }).c
  }
}
