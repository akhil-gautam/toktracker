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

export interface HookEventRow {
  id?: number
  sessionId: string | null
  hookKind: string
  payloadJson: string
  decision?: string | null
  reason?: string | null
  latencyMs?: number | null
  createdAt: number
}

export class HookEventsRepo {
  constructor(private db: Database.Database) {}
  insert(h: HookEventRow): HookEventRow {
    const info = this.db.prepare(`
      INSERT INTO hook_events (session_id, hook_kind, payload_json, decision, reason, latency_ms, created_at)
      VALUES (@sessionId, @hookKind, @payloadJson, @decision, @reason, @latencyMs, @createdAt)
    `).run({
      sessionId: h.sessionId, hookKind: h.hookKind, payloadJson: h.payloadJson,
      decision: h.decision ?? null, reason: h.reason ?? null,
      latencyMs: h.latencyMs ?? null, createdAt: h.createdAt,
    })
    return { ...h, id: Number(info.lastInsertRowid) }
  }
  latencyPercentiles(limit = 1000): { p50: number; p95: number; count: number } {
    const rows = this.db.prepare('SELECT latency_ms FROM hook_events WHERE latency_ms IS NOT NULL ORDER BY created_at DESC LIMIT ?').all(limit) as { latency_ms: number }[]
    if (!rows.length) return { p50: 0, p95: 0, count: 0 }
    const sorted = rows.map(r => r.latency_ms).sort((a, b) => a - b)
    return { p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], count: sorted.length }
  }
}

export interface GitEventRow {
  id?: number
  repo: string
  kind: string
  sha?: string | null
  prNumber?: number | null
  branch?: string | null
  title?: string | null
  subject?: string | null
  committedAt?: number | null
  createdAt: number
}

export class GitEventsRepo {
  constructor(private db: Database.Database) {}
  upsert(e: GitEventRow): void {
    // INSERT OR IGNORE would skip updating title/subject on a later poll, so
    // use ON CONFLICT DO UPDATE and only overwrite optional metadata when the
    // new poll actually provided a non-null value.
    this.db.prepare(`
      INSERT INTO git_events (repo, kind, sha, pr_number, branch, title, subject, committed_at, created_at)
      VALUES (@repo, @kind, @sha, @prNumber, @branch, @title, @subject, @committedAt, @createdAt)
      ON CONFLICT(repo, kind, COALESCE(sha,''), COALESCE(pr_number,0))
      DO UPDATE SET
        title        = COALESCE(excluded.title, git_events.title),
        subject      = COALESCE(excluded.subject, git_events.subject),
        committed_at = COALESCE(excluded.committed_at, git_events.committed_at),
        branch       = COALESCE(excluded.branch, git_events.branch)
    `).run({
      repo: e.repo, kind: e.kind,
      sha: e.sha ?? null, prNumber: e.prNumber ?? null,
      branch: e.branch ?? null,
      title: e.title ?? null, subject: e.subject ?? null,
      committedAt: e.committedAt ?? null,
      createdAt: e.createdAt,
    })
  }
  findByRepo(repo: string): GitEventRow[] {
    return (this.db.prepare('SELECT * FROM git_events WHERE repo = ? ORDER BY created_at DESC').all(repo) as any[])
      .map(r => ({ id: r.id, repo: r.repo, kind: r.kind, sha: r.sha, prNumber: r.pr_number, branch: r.branch, createdAt: r.created_at }))
  }
  recentMerged(sinceMs: number): GitEventRow[] {
    return (this.db.prepare(`SELECT * FROM git_events WHERE kind = 'pr_merged' AND created_at >= ? ORDER BY created_at DESC`).all(sinceMs) as any[])
      .map(r => ({ id: r.id, repo: r.repo, kind: r.kind, sha: r.sha, prNumber: r.pr_number, branch: r.branch, createdAt: r.created_at }))
  }
}

export interface DetectionRow {
  id?: number
  sessionId: string | null
  ruleId: string
  severity: 'info' | 'warn' | 'block'
  summary: string
  metadataJson?: string | null
  suggestedActionJson?: string | null
  acknowledgedAt?: number | null
  createdAt: number
}

export class DetectionsRepo {
  constructor(private db: Database.Database) {}
  insert(d: DetectionRow): DetectionRow {
    const info = this.db.prepare(`
      INSERT INTO detections (session_id, rule_id, severity, summary, metadata_json, suggested_action_json, acknowledged_at, created_at)
      VALUES (@sessionId, @ruleId, @severity, @summary, @metadataJson, @suggestedActionJson, @acknowledgedAt, @createdAt)
    `).run({
      sessionId: d.sessionId, ruleId: d.ruleId, severity: d.severity, summary: d.summary,
      metadataJson: d.metadataJson ?? null, suggestedActionJson: d.suggestedActionJson ?? null,
      acknowledgedAt: d.acknowledgedAt ?? null, createdAt: d.createdAt,
    })
    return { ...d, id: Number(info.lastInsertRowid) }
  }
  recent(limit: number): DetectionRow[] {
    return (this.db.prepare('SELECT * FROM detections ORDER BY created_at DESC LIMIT ?').all(limit) as any[])
      .map(r => ({
        id: r.id, sessionId: r.session_id, ruleId: r.rule_id, severity: r.severity,
        summary: r.summary, metadataJson: r.metadata_json,
        suggestedActionJson: r.suggested_action_json, acknowledgedAt: r.acknowledged_at, createdAt: r.created_at,
      }))
  }
  acknowledge(id: number): void {
    this.db.prepare('UPDATE detections SET acknowledged_at = ? WHERE id = ?').run(Date.now(), id)
  }
}

export interface FeatureFlagRow {
  key: string
  enabled: number
  configJson?: string | null
}

export class FeatureFlagsRepo {
  constructor(private db: Database.Database) {}
  set(key: string, config: Record<string, unknown>): void {
    const enabled = config.enabled === false ? 0 : 1
    this.db.prepare(`
      INSERT INTO feature_flags (key, enabled, config_json) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, config_json = excluded.config_json
    `).run(key, enabled, JSON.stringify(config))
  }
  get(key: string): { enabled: number; config: Record<string, unknown> | null } | null {
    const row = this.db.prepare('SELECT enabled, config_json FROM feature_flags WHERE key = ?').get(key) as { enabled: number; config_json: string | null } | undefined
    if (!row) return null
    return { enabled: row.enabled, config: row.config_json ? JSON.parse(row.config_json) : null }
  }
  all(): Array<{ key: string; enabled: number; config: Record<string, unknown> | null }> {
    return (this.db.prepare('SELECT key, enabled, config_json FROM feature_flags ORDER BY key').all() as any[])
      .map(r => ({ key: r.key, enabled: r.enabled, config: r.config_json ? JSON.parse(r.config_json) : null }))
  }
}

export interface PrAttributionRow {
  prNumber: number
  repo: string
  sessionId: string
  overlapKind: 'branch_match' | 'commit_ancestor' | 'file_overlap'
  confidence: number
}

export class PrAttributionsRepo {
  constructor(private db: Database.Database) {}
  upsert(r: PrAttributionRow): void {
    this.db.prepare(`
      INSERT INTO pr_attributions (pr_number, repo, session_id, overlap_kind, confidence)
      VALUES (@prNumber, @repo, @sessionId, @overlapKind, @confidence)
      ON CONFLICT(pr_number, repo, session_id) DO UPDATE SET
        overlap_kind = excluded.overlap_kind, confidence = excluded.confidence
    `).run(r)
  }
  findByPr(repo: string, prNumber: number): PrAttributionRow[] {
    return (this.db.prepare('SELECT * FROM pr_attributions WHERE repo = ? AND pr_number = ?').all(repo, prNumber) as any[])
      .map(r => ({ prNumber: r.pr_number, repo: r.repo, sessionId: r.session_id, overlapKind: r.overlap_kind, confidence: r.confidence }))
  }
  totalCostCentsForPr(repo: string, prNumber: number): number {
    const row = this.db.prepare(`
      SELECT COALESCE(SUM(s.cost_millicents * pa.confidence), 0) as total
      FROM pr_attributions pa JOIN sessions s ON s.id = pa.session_id
      WHERE pa.repo = ? AND pa.pr_number = ?
    `).get(repo, prNumber) as { total: number }
    return Math.round(row.total / 10)
  }
}

export interface CommitAttributionRow {
  sha: string
  repo: string
  sessionId: string
  branch?: string | null
  subject?: string | null
  committedAt: number
  createdAt: number
}

export class CommitAttributionsRepo {
  constructor(private db: Database.Database) {}
  upsert(r: CommitAttributionRow): void {
    this.db.prepare(`
      INSERT INTO commit_attributions (commit_sha, repo, session_id, branch, subject, committed_at, created_at)
      VALUES (@sha, @repo, @sessionId, @branch, @subject, @committedAt, @createdAt)
      ON CONFLICT(commit_sha, repo, session_id) DO UPDATE SET
        branch       = COALESCE(excluded.branch, commit_attributions.branch),
        subject      = COALESCE(excluded.subject, commit_attributions.subject),
        committed_at = excluded.committed_at
    `).run({
      sha: r.sha, repo: r.repo, sessionId: r.sessionId,
      branch: r.branch ?? null, subject: r.subject ?? null,
      committedAt: r.committedAt, createdAt: r.createdAt,
    })
  }
  recent(limit: number): Array<CommitAttributionRow & { cost: number }> {
    return (this.db.prepare(`
      SELECT ca.commit_sha, ca.repo, ca.session_id, ca.branch, ca.subject,
             ca.committed_at, ca.created_at,
             COALESCE(s.cost_millicents, 0) AS cost
      FROM commit_attributions ca
      LEFT JOIN sessions s ON s.id = ca.session_id
      ORDER BY ca.committed_at DESC
      LIMIT ?
    `).all(limit) as any[]).map(r => ({
      sha: r.commit_sha, repo: r.repo, sessionId: r.session_id,
      branch: r.branch, subject: r.subject,
      committedAt: r.committed_at, createdAt: r.created_at,
      cost: r.cost ?? 0,
    }))
  }
}

export class BatchRunsRepo {
  constructor(private db: Database.Database) {}
  mark(jobName: string, status: string, at: number = Date.now()): void {
    this.db.prepare(`
      INSERT INTO batch_runs (job_name, last_run_at, last_status)
      VALUES (?, ?, ?)
      ON CONFLICT(job_name) DO UPDATE SET last_run_at = excluded.last_run_at, last_status = excluded.last_status
    `).run(jobName, at, status)
  }
  lastRunAt(jobName: string): number | null {
    const row = this.db.prepare('SELECT last_run_at FROM batch_runs WHERE job_name = ?').get(jobName) as { last_run_at: number } | undefined
    return row?.last_run_at ?? null
  }
}
