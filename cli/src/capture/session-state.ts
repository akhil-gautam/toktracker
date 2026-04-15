interface TokenTotals { input: number; output: number; cacheRead: number; cacheWrite: number }

export class SessionStateCache {
  private toolCallCounts = new Map<string, Map<string, number>>()  // sessionId → `${tool}|${argsHash}` → count
  private tokens_ = new Map<string, TokenTotals>()
  private failures = new Map<string, number>()
  private turnCount = new Map<string, number>()

  recordToolCall(sessionId: string, toolName: string, argsHash: string): void {
    const key = `${toolName}|${argsHash}`
    const m = this.toolCallCounts.get(sessionId) ?? new Map()
    m.set(key, (m.get(key) ?? 0) + 1)
    this.toolCallCounts.set(sessionId, m)
  }
  countToolCalls(sessionId: string, toolName: string, argsHash: string): number {
    return this.toolCallCounts.get(sessionId)?.get(`${toolName}|${argsHash}`) ?? 0
  }
  addTokens(sessionId: string, delta: Partial<TokenTotals>): void {
    const t = this.tokens_.get(sessionId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
    t.input += delta.input ?? 0
    t.output += delta.output ?? 0
    t.cacheRead += delta.cacheRead ?? 0
    t.cacheWrite += delta.cacheWrite ?? 0
    this.tokens_.set(sessionId, t)
  }
  tokens(sessionId: string): TokenTotals {
    return this.tokens_.get(sessionId) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  }
  recordToolResult(sessionId: string, r: { succeeded: boolean }): void {
    if (!r.succeeded) this.failures.set(sessionId, (this.failures.get(sessionId) ?? 0) + 1)
  }
  failedCount(sessionId: string): number {
    return this.failures.get(sessionId) ?? 0
  }
  incrementTurn(sessionId: string): number {
    const v = (this.turnCount.get(sessionId) ?? 0) + 1
    this.turnCount.set(sessionId, v)
    return v
  }
  currentTurn(sessionId: string): number {
    return this.turnCount.get(sessionId) ?? 0
  }
  flush(sessionId: string): void {
    this.toolCallCounts.delete(sessionId)
    this.tokens_.delete(sessionId)
    this.failures.delete(sessionId)
    this.turnCount.delete(sessionId)
  }
}

export const sessionStateCache = new SessionStateCache()
