import type { Session, DayStats, ModelStats, ToolStats, RepoStats, TodayDetailStats, AllTimeStats, ModelDetailStats, RepoDetailStats } from '../types.js'
import { getContextWindow } from '../data/context-windows.js'

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
  modelDetails: Map<string, ModelDetailStats>
  repoDetails: Map<string, RepoDetailStats>
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
    // Per-model detail: tools, repos, daily trend, peak input
    interface PerModelAccum {
      tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number }
      maxInput: number
      totalInput: number // for avg
      tools: Map<string, { cost: number; count: number }>
      repos: Map<string, { cost: number; count: number }>
      toolUses: Map<string, number>  // tool name -> invocation count
    }
    const modelDetailMap = new Map<string, PerModelAccum>()

    // Per-repo detail accumulator
    interface PerRepoAccum {
      tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; reasoning: number }
      models: Map<string, { cost: number; count: number }>
      tools: Map<string, { cost: number; count: number }>
      branches: Map<string, { cost: number; count: number }>
      activeDates: Set<string>
      first?: Date
      last?: Date
    }
    const repoDetailMap = new Map<string, PerRepoAccum>()
    const repoDailyMap = new Map<string, Map<string, number>>()  // repo → date → cost (30d)

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

      // Per-model detail
      let mdAccum = modelDetailMap.get(s.model)
      if (!mdAccum) {
        mdAccum = {
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
          maxInput: 0, totalInput: 0,
          tools: new Map(), repos: new Map(), toolUses: new Map(),
        }
        modelDetailMap.set(s.model, mdAccum)
      }
      mdAccum.tokens.input += s.inputTokens
      mdAccum.tokens.output += s.outputTokens
      mdAccum.tokens.cacheRead += s.cacheReadTokens
      mdAccum.tokens.cacheWrite += s.cacheWriteTokens
      mdAccum.tokens.reasoning += s.reasoningTokens
      mdAccum.totalInput += s.inputTokens
      if (s.inputTokens > mdAccum.maxInput) mdAccum.maxInput = s.inputTokens

      const mtEntry = mdAccum.tools.get(s.tool)
      if (mtEntry) { mtEntry.cost += s.costMillicents; mtEntry.count++ }
      else mdAccum.tools.set(s.tool, { cost: s.costMillicents, count: 1 })

      if (s.gitRepo) {
        const mrEntry = mdAccum.repos.get(s.gitRepo)
        if (mrEntry) { mrEntry.cost += s.costMillicents; mrEntry.count++ }
        else mdAccum.repos.set(s.gitRepo, { cost: s.costMillicents, count: 1 })
      }

      // Tool uses (Claude Code: Read, Grep, Bash, etc.)
      if (s.toolUses) {
        for (const [name, count] of Object.entries(s.toolUses)) {
          mdAccum.toolUses.set(name, (mdAccum.toolUses.get(name) ?? 0) + count)
        }
      }

      // Tools (all-time)
      const te = toolMap.get(s.tool)
      if (te) { te.costMillicents += s.costMillicents; te.sessionCount++ }
      else toolMap.set(s.tool, { tool: s.tool, costMillicents: s.costMillicents, sessionCount: 1 })

      // Repos (all-time)
      if (s.gitRepo) {
        const re = repoMap.get(s.gitRepo)
        if (re) { re.costMillicents += s.costMillicents; re.sessionCount++; if (!re.models.includes(s.model)) re.models.push(s.model) }
        else repoMap.set(s.gitRepo, { repo: s.gitRepo, costMillicents: s.costMillicents, sessionCount: 1, models: [s.model] })

        // Per-repo detail
        let rdAccum = repoDetailMap.get(s.gitRepo)
        if (!rdAccum) {
          rdAccum = {
            tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 },
            models: new Map(), tools: new Map(), branches: new Map(),
            activeDates: new Set(),
          }
          repoDetailMap.set(s.gitRepo, rdAccum)
        }
        rdAccum.tokens.input += s.inputTokens
        rdAccum.tokens.output += s.outputTokens
        rdAccum.tokens.cacheRead += s.cacheReadTokens
        rdAccum.tokens.cacheWrite += s.cacheWriteTokens
        rdAccum.tokens.reasoning += s.reasoningTokens
        rdAccum.activeDates.add(dk)
        if (!rdAccum.first || s.startedAt < rdAccum.first) rdAccum.first = s.startedAt
        if (!rdAccum.last || s.startedAt > rdAccum.last) rdAccum.last = s.startedAt

        const rmEntry = rdAccum.models.get(s.model)
        if (rmEntry) { rmEntry.cost += s.costMillicents; rmEntry.count++ }
        else rdAccum.models.set(s.model, { cost: s.costMillicents, count: 1 })

        const rtEntry = rdAccum.tools.get(s.tool)
        if (rtEntry) { rtEntry.cost += s.costMillicents; rtEntry.count++ }
        else rdAccum.tools.set(s.tool, { cost: s.costMillicents, count: 1 })

        if (s.gitBranch) {
          const rbEntry = rdAccum.branches.get(s.gitBranch)
          if (rbEntry) { rbEntry.cost += s.costMillicents; rbEntry.count++ }
          else rdAccum.branches.set(s.gitBranch, { cost: s.costMillicents, count: 1 })
        }

        // Repo daily trend (30d)
        if (s.startedAt >= daysAgo(29)) {
          let rd = repoDailyMap.get(s.gitRepo)
          if (!rd) { rd = new Map(); repoDailyMap.set(s.gitRepo, rd) }
          rd.set(dk, (rd.get(dk) ?? 0) + s.costMillicents)
        }
      }

      // Daily accumulator
      const de = dailyMap.get(dk)
      if (de) { de.costMillicents += s.costMillicents; de.inputTokens += s.inputTokens; de.outputTokens += s.outputTokens; de.sessionCount++ }
      else dailyMap.set(dk, { date: dk, costMillicents: s.costMillicents, inputTokens: s.inputTokens, outputTokens: s.outputTokens, sessionCount: 1 })

      // Model trends daily — track up to 30 days back
      if (s.startedAt >= daysAgo(29)) {
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

    // Build model trends (7d for existing sparkline, 30d for expanded view)
    const modelTrends: Record<string, number[]> = {}
    const modelTrends30: Record<string, number[]> = {}
    for (const [model, dailyCosts] of modelDailyMap) {
      const arr7: number[] = []
      const arr30: number[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        arr7.push(dailyCosts.get(dateKey(d)) ?? 0)
      }
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        arr30.push(dailyCosts.get(dateKey(d)) ?? 0)
      }
      modelTrends[model] = arr7
      modelTrends30[model] = arr30
    }

    // Build per-model detail stats
    const modelDetails = new Map<string, ModelDetailStats>()
    for (const [model, acc] of modelDetailMap) {
      const stat = modelMap.get(model)!
      modelDetails.set(model, {
        model,
        costMillicents: stat.costMillicents,
        sessionCount: stat.sessionCount,
        inputTokens: acc.tokens.input,
        outputTokens: acc.tokens.output,
        cacheReadTokens: acc.tokens.cacheRead,
        cacheWriteTokens: acc.tokens.cacheWrite,
        reasoningTokens: acc.tokens.reasoning,
        maxInputTokens: acc.maxInput,
        avgInputTokens: stat.sessionCount > 0 ? Math.round(acc.totalInput / stat.sessionCount) : 0,
        contextWindow: getContextWindow(model),
        tools: Array.from(acc.tools.entries())
          .map(([tool, v]) => ({ tool, costMillicents: v.cost, sessionCount: v.count }))
          .sort((a, b) => b.costMillicents - a.costMillicents),
        repos: Array.from(acc.repos.entries())
          .map(([repo, v]) => ({ repo, costMillicents: v.cost, sessionCount: v.count }))
          .sort((a, b) => b.costMillicents - a.costMillicents),
        dailyTrend: modelTrends30[model] ?? [],
        toolUses: Array.from(acc.toolUses.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      })
    }

    // Build per-repo detail stats
    const repoDetails = new Map<string, RepoDetailStats>()
    for (const [repo, acc] of repoDetailMap) {
      const stat = repoMap.get(repo)!
      const trend30: number[] = []
      const rd = repoDailyMap.get(repo)
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i)
        trend30.push(rd?.get(dateKey(d)) ?? 0)
      }
      repoDetails.set(repo, {
        repo,
        costMillicents: stat.costMillicents,
        sessionCount: stat.sessionCount,
        inputTokens: acc.tokens.input,
        outputTokens: acc.tokens.output,
        cacheReadTokens: acc.tokens.cacheRead,
        cacheWriteTokens: acc.tokens.cacheWrite,
        reasoningTokens: acc.tokens.reasoning,
        models: Array.from(acc.models.entries())
          .map(([model, v]) => ({ model, costMillicents: v.cost, sessionCount: v.count }))
          .sort((a, b) => b.costMillicents - a.costMillicents),
        tools: Array.from(acc.tools.entries())
          .map(([tool, v]) => ({ tool, costMillicents: v.cost, sessionCount: v.count }))
          .sort((a, b) => b.costMillicents - a.costMillicents),
        branches: Array.from(acc.branches.entries())
          .map(([branch, v]) => ({ branch, costMillicents: v.cost, sessionCount: v.count }))
          .sort((a, b) => b.costMillicents - a.costMillicents),
        dailyTrend: trend30,
        firstSession: acc.first,
        lastSession: acc.last,
        activeDays: acc.activeDates.size,
      })
    }

    // Week over week delta
    let weekOverWeekDelta = 0
    if (lastWeekTotal === 0) weekOverWeekDelta = thisWeekTotal > 0 ? 100 : 0
    else weekOverWeekDelta = Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100)

    // Recent sessions (sorted, limited)
    const recentSessions = Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 1000)

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
      modelDetails,
      repoDetails,
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
  getModelDetail(model: string): ModelDetailStats | undefined { return this.ensureCache().modelDetails.get(model) }
  getRepoDetail(repo: string): RepoDetailStats | undefined { return this.ensureCache().repoDetails.get(repo) }
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
