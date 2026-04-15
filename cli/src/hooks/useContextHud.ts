import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'

export interface HudState {
  contextUsed: number
  contextLimit: number
  etaTurns: number | null
  todayCostCents: number
}

export function useContextHud(db: Database.Database, activeSessionId?: string): HudState {
  const [state, setState] = useState<HudState>({ contextUsed: 0, contextLimit: 200_000, etaTurns: null, todayCostCents: 0 })
  useEffect(() => {
    const load = () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayRow = db.prepare('SELECT COALESCE(SUM(cost_millicents),0) as c FROM sessions WHERE started_at >= ?').get(todayStart.getTime()) as { c: number }
      if (!activeSessionId) {
        setState(s => ({ ...s, todayCostCents: Math.round(todayRow.c / 10) }))
        return
      }
      const usedRow = db.prepare(`
        SELECT COALESCE(SUM(input_tokens+output_tokens),0) as used, COUNT(*) as turns
        FROM messages WHERE session_id = ? AND role = 'assistant'
      `).get(activeSessionId) as { used: number; turns: number }
      const limit = 200_000
      const etaTurns = usedRow.turns > 0 ? Math.max(0, Math.floor((limit - usedRow.used) / (usedRow.used / usedRow.turns))) : null
      setState({ contextUsed: usedRow.used, contextLimit: limit, etaTurns, todayCostCents: Math.round(todayRow.c / 10) })
    }
    load()
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [db, activeSessionId])
  return state
}
