import type { Session, DayStats, ModelStats, ToolStats, RepoStats, TodayDetailStats, AllTimeStats } from '../types.js'

function dateKey(d: Date): string { return d.toISOString().slice(0, 10) }
function todayKey(): string { return dateKey(new Date()) }
function isToday(d: Date): boolean { return dateKey(d) === todayKey() }
function daysAgo(n: number): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d
}

interface CachedStats {
  todayStats: DayStats
  weekTotal: number
  allTimeTotal: number
  modelStats: ModelStats[]
  toolStats: ToolStats[]
  repoStats: RepoStats[]
  activeTools: string[]
  topRepo: RepoStats | undefined
  weekStats: DayStats[]
  weekOverWeekDelta: number
  modelTrends: Record<string, number[]>
  dailyByDate: Map<string, DayStats>
  recentSessions: Session[]
  earliest: Date | null
  todayDetail: TodayDetailStats
  allTime: AllTimeStats
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map()
  private cache: CachedStats | null = null

  addSessions(newSessions: Session[]) {
    for (const s of newSessions) this.sessions.set(s.id, s)
    this.cache = null // invalidate
  }

  getAllSessions(): Session[] { return Array.from(this.sessions.values()) }
  getAllTimeSessions(): number { return this.sessions.size }

  private ensureCache(): CachedStats {
    if (this.cache) return this.cache

    const today = todayKey()
    const weekStart = daysAgo(6)
    const lastWeekStart = daysAgo(13)

    // Accumulators
    let allTimeTotal = 0, allTimeIn = 0, allTimeOut = 0, allTimeCacheRead = 0
    let allTimeCacheWrite = 0, allTimeReasoning = 0
    let todayCost = 0, todayIn = 0, todayOut = 0, todayCount = 0
    let todayCacheRead = 0, todayCacheWrite = 0, todayReasoning = 0
    let todayFirst: Date | undefined, todayLast: Date | undefined
    let thisWeekTotal = 0, lastWeekTotal = 0

    const modelMap = new Map<string, ModelStats>()
    const toolMap = new Map<string, ToolStats>()
    const repoMap = new Map<string, RepoStats>()
    const todayRepoMap = new Map<string, RepoStats>()
    const todayModelMap = new Map<string, ModelStats>()
    const todayToolMap = new Map<string, ToolStats>()
    const todayTools = new Set<string>()
    const todayHourly = new Array(24).fill(0)
    const dailyMap = new Map<string, DayStats>()
    // model → dateKey → cost
    const modelDailyMap = new Map<string, Map<string, number>>()
    let earliest: Date | null = null

    // Single pass over all sessions
    for (const s of this.sessions.values()) {
      allTimeTotal += s.costMillicents
      allTimeIn += s.inputTokens
      allTimeOut += s.outputTokens
      allTimeCacheRead += s.cacheReadTokens
      allTimeCacheWrite += s.cacheWriteTokens
      allTimeReasoning += s.reasoningTokens
      const dk = dateKey(s.startedAt)

      // Today
      if (dk === today) {
        todayCost += s.costMillicents
        todayIn += s.inputTokens
        todayOut += s.outputTokens
        todayCacheRead += s.cacheReadTokens
        todayCacheWrite += s.cacheWriteTokens
        todayReasoning += s.reasoningTokens
        todayCount++
        todayTools.add(s.tool)
        todayHourly[s.startedAt.getHours()] += s.costMillicents

        if (!todayFirst || s.startedAt < todayFirst) todayFirst = s.startedAt
        if (!todayLast || s.startedAt > todayLast) todayLast = s.startedAt

        // Today models
        const tme = todayModelMap.get(s.model)
        if (tme) { tme.costMillicents += s.costMillicents; tme.inputTokens += s.inputTokens; tme.outputTokens += s.outputTokens; tme.sessionCount++ }
        else todayModelMap.set(s.model, { model: s.model, costMillicents: s.costMillicents, inputTokens: s.inputTokens, outputTokens: s.outputTokens, sessionCount: 1 })

        // Today tools
        const tte = todayToolMap.get(s.tool)
        if (tte) { tte.costMillicents += s.costMillicents; tte.sessionCount++ }
        else todayToolMap.set(s.tool, { tool: s.tool, costMillicents: s.costMillicents, sessionCount: 1 })

        // Today repos
        if (s.gitRepo) {
          const e = todayRepoMap.get(s.gitRepo)
          if (e) { e.costMillicents += s.costMillicents; e.sessionCount++; if (!e.models.includes(s.model)) e.models.push(s.model) }
          else todayRepoMap.set(s.gitRepo, { repo: s.gitRepo, costMillicents: s.costMillicents, sessionCount: 1, models: [s.model] })
        }
      }

      // Week totals
      if (s.startedAt >= weekStart) thisWeekTotal += s.costMillicents
      else if (s.startedAt >= lastWeekStart) lastWeekTotal += s.costMillicents

      // Models (all-time)
      const me = modelMap.get(s.model)
      if (me) { me.costMillicents += s.costMillicents; me.inputTokens += s.inputTokens; me.outputTokens += s.outputTokens; me.sessionCount++ }
      else modelMap.set(s.model, { model: s.model, costMillicents: s.costMillicents, inputTokens: s.inputTokens, outputTokens: s.outputTokens, sessionCount: 1 })

      // Tools (all-time)
      const te = toolMap.get(s.tool)
      if (te) { te.costMillicents += s.costMillicents; te.sessionCount++ }
      else toolMap.set(s.tool, { tool: s.tool, costMillicents: s.costMillicents, sessionCount: 1 })

      // Repos (all-time)
      if (s.gitRepo) {
        const re = repoMap.get(s.gitRepo)
        if (re) { re.costMillicents += s.costMillicents; re.sessionCount++; if (!re.models.includes(s.model)) re.models.push(s.model) }
        else repoMap.set(s.gitRepo, { repo: s.gitRepo, costMillicents: s.costMillicents, sessionCount: 1, models: [s.model] })
      }

      // Daily accumulator
      const de = dailyMap.get(dk)
      if (de) { de.costMillicents += s.costMillicents; de.inputTokens += s.inputTokens; de.outputTokens += s.outputTokens; de.sessionCount++ }
      else dailyMap.set(dk, { date: dk, costMillicents: s.costMillicents, inputTokens: s.inputTokens, outputTokens: s.outputTokens, sessionCount: 1 })

      // Model trends daily
      if (s.startedAt >= weekStart) {
        let md = modelDailyMap.get(s.model)
        if (!md) { md = new Map(); modelDailyMap.set(s.model, md) }
        md.set(dk, (md.get(dk) ?? 0) + s.costMillicents)
      }

      // Earliest
      if (!earliest || s.startedAt < earliest) earliest = s.startedAt
    }

    // Build week stats (ensure all 7 days present)
    const weekStatsMap = new Map<string, DayStats>()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const key = dateKey(d)
      weekStatsMap.set(key, dailyMap.get(key) ?? { date: key, costMillicents: 0, inputTokens: 0, outputTokens: 0, sessionCount: 0 })
    }

    // Build model trends (7 arrays)
    const modelTrends: Record<string, number[]> = {}
    for (const [model, dailyCosts] of modelDailyMap) {
      const arr: number[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        arr.push(dailyCosts.get(dateKey(d)) ?? 0)
      }
      modelTrends[model] = arr
    }

    // Week over week delta
    let weekOverWeekDelta = 0
    if (lastWeekTotal === 0) weekOverWeekDelta = thisWeekTotal > 0 ? 100 : 0
    else weekOverWeekDelta = Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)

    // Recent sessions (sorted, limited)
    const recentSessions = Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 50)

    const totalCacheIn = allTimeCacheRead + allTimeCacheWrite + allTimeIn
    const cacheReuseRatio = totalCacheIn > 0 ? allTimeCacheRead / totalCacheIn : 0

    const allTime: AllTimeStats = {
      costMillicents: allTimeTotal,
      sessionCount: this.sessions.size,
      inputTokens: allTimeIn,
      outputTokens: allTimeOut,
      cacheReadTokens: allTimeCacheRead,
      cacheWriteTokens: allTimeCacheWrite,
      reasoningTokens: allTimeReasoning,
      uniqueModels: modelMap.size,
      uniqueTools: toolMap.size,
      uniqueRepos: repoMap.size,
      activeDays: dailyMap.size,
      cacheReuseRatio,
    }

    const todayDetail: TodayDetailStats = {
      costMillicents: todayCost,
      sessionCount: todayCount,
      inputTokens: todayIn,
      outputTokens: todayOut,
      cacheReadTokens: todayCacheRead,
      cacheWriteTokens: todayCacheWrite,
      reasoningTokens: todayReasoning,
      models: Array.from(todayModelMap.values()).sort((a, b) => b.costMillicents - a.costMillicents),
      tools: Array.from(todayToolMap.values()).sort((a, b) => b.costMillicents - a.costMillicents),
      repos: Array.from(todayRepoMap.values()).sort((a, b) => b.costMillicents - a.costMillicents),
      hourly: todayHourly,
      firstSession: todayFirst,
      lastSession: todayLast,
    }

    this.cache = {
      todayStats: { date: today, costMillicents: todayCost, inputTokens: todayIn, outputTokens: todayOut, sessionCount: todayCount },
      weekTotal: thisWeekTotal,
      allTimeTotal,
      modelStats: Array.from(modelMap.values()).sort((a, b) => b.costMillicents - a.costMillicents),
      toolStats: Array.from(toolMap.values()).sort((a, b) => b.costMillicents - a.costMillicents),
      repoStats: Array.from(repoMap.values()).sort((a, b) => b.costMillicents - a.costMillicents),
      activeTools: Array.from(todayTools),
      topRepo: Array.from(todayRepoMap.values()).sort((a, b) => b.costMillicents - a.costMillicents)[0],
      weekStats: Array.from(weekStatsMap.values()),
      weekOverWeekDelta,
      modelTrends,
      dailyByDate: dailyMap,
      recentSessions,
      earliest,
      todayDetail,
      allTime,
    }
    return this.cache
  }

  getTodayStats(): DayStats { return this.ensureCache().todayStats }
  getWeekTotal(): number { return this.ensureCache().weekTotal }
  getAllTimeTotal(): number { return this.ensureCache().allTimeTotal }
  getModelStats(): ModelStats[] { return this.ensureCache().modelStats }
  getToolStats(): ToolStats[] { return this.ensureCache().toolStats }
  getRepoStats(): RepoStats[] { return this.ensureCache().repoStats }
  getActiveTools(): string[] { return this.ensureCache().activeTools }
  getTopRepo(): RepoStats | undefined { return this.ensureCache().topRepo }
  getWeekStats(): DayStats[] { return this.ensureCache().weekStats }
  getWeekOverWeekDelta(): number { return this.ensureCache().weekOverWeekDelta }
  getModelTrends(): Record<string, number[]> { return this.ensureCache().modelTrends }
  getTodayDetail(): TodayDetailStats { return this.ensureCache().todayDetail }
  getAllTimeStats(): AllTimeStats { return this.ensureCache().allTime }
  getRecentSessions(limit: number = 50): Session[] { return this.ensureCache().recentSessions.slice(0, limit) }

  getDailyStats(days: number): DayStats[] {
    const cache = this.ensureCache()
    const result: DayStats[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const key = dateKey(d)
      result.push(cache.dailyByDate.get(key) ?? { date: key, costMillicents: 0, inputTokens: 0, outputTokens: 0, sessionCount: 0 })
    }
    return result
  }

  getDateRange(): { earliest: Date; latest: Date } | null {
    const cache = this.ensureCache()
    if (!cache.earliest) return null
    const latest = cache.recentSessions[0]?.startedAt ?? new Date()
    return { earliest: cache.earliest, latest }
  }

  getAllDailyStats(): DayStats[] {
    const range = this.getDateRange()
    if (!range) return this.getDailyStats(7)
    const diffDays = Math.ceil((range.latest.getTime() - range.earliest.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return this.getDailyStats(Math.max(diffDays, 7))
  }
}
