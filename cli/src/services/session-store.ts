import type { Session, DayStats, ModelStats, ToolStats, RepoStats } from '../types.js'

function dateKey(d: Date): string { return d.toISOString().slice(0, 10) }
function todayKey(): string { return dateKey(new Date()) }
function isToday(d: Date): boolean { return dateKey(d) === todayKey() }
function daysAgo(n: number): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map()

  addSessions(newSessions: Session[]) { for (const s of newSessions) this.sessions.set(s.id, s) }
  getAllSessions(): Session[] { return Array.from(this.sessions.values()) }

  getTodayStats(): DayStats {
    let costMillicents = 0, inputTokens = 0, outputTokens = 0, sessionCount = 0
    for (const s of this.sessions.values()) {
      if (isToday(s.startedAt)) { costMillicents += s.costMillicents; inputTokens += s.inputTokens; outputTokens += s.outputTokens; sessionCount++ }
    }
    return { date: todayKey(), costMillicents, inputTokens, outputTokens, sessionCount }
  }

  getWeekTotal(): number {
    const weekStart = daysAgo(6); let total = 0
    for (const s of this.sessions.values()) if (s.startedAt >= weekStart) total += s.costMillicents
    return total
  }

  getWeekStats(): DayStats[] {
    const dayMap = new Map<string, DayStats>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const key = dateKey(d)
      dayMap.set(key, { date: key, costMillicents: 0, inputTokens: 0, outputTokens: 0, sessionCount: 0 })
    }
    const weekStart = daysAgo(6)
    for (const s of this.sessions.values()) {
      if (s.startedAt >= weekStart) {
        const day = dayMap.get(dateKey(s.startedAt))
        if (day) { day.costMillicents += s.costMillicents; day.inputTokens += s.inputTokens; day.outputTokens += s.outputTokens; day.sessionCount++ }
      }
    }
    return Array.from(dayMap.values())
  }

  getModelStats(): ModelStats[] {
    const map = new Map<string, ModelStats>()
    for (const s of this.sessions.values()) {
      if (!isToday(s.startedAt)) continue
      const e = map.get(s.model)
      if (e) { e.costMillicents += s.costMillicents; e.inputTokens += s.inputTokens; e.outputTokens += s.outputTokens; e.sessionCount++ }
      else map.set(s.model, { model: s.model, costMillicents: s.costMillicents, inputTokens: s.inputTokens, outputTokens: s.outputTokens, sessionCount: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.costMillicents - a.costMillicents)
  }

  getToolStats(): ToolStats[] {
    const map = new Map<string, ToolStats>()
    for (const s of this.sessions.values()) {
      if (!isToday(s.startedAt)) continue
      const e = map.get(s.tool)
      if (e) { e.costMillicents += s.costMillicents; e.sessionCount++ }
      else map.set(s.tool, { tool: s.tool, costMillicents: s.costMillicents, sessionCount: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.costMillicents - a.costMillicents)
  }

  getRepoStats(): RepoStats[] {
    const map = new Map<string, RepoStats>()
    for (const s of this.sessions.values()) {
      if (!s.gitRepo) continue
      const e = map.get(s.gitRepo)
      if (e) { e.costMillicents += s.costMillicents; e.sessionCount++; if (!e.models.includes(s.model)) e.models.push(s.model) }
      else map.set(s.gitRepo, { repo: s.gitRepo, costMillicents: s.costMillicents, sessionCount: 1, models: [s.model] })
    }
    return Array.from(map.values()).sort((a, b) => b.costMillicents - a.costMillicents)
  }

  getRecentSessions(limit: number = 20): Session[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, limit)
  }
}
