import { useState, useEffect } from 'react'
import { SessionStore } from '../services/session-store.js'
import { StateManager } from '../services/state-manager.js'
import { loadAllSessions } from '../parsers/index.js'
import { checkBudgets, type BudgetResult } from './useBudget.js'

interface UseSessionsResult {
  store: SessionStore; budgetResults: BudgetResult[]; loading: boolean; error: string | null; serverMode: boolean
}

export function useSessions(): UseSessionsResult {
  const [store] = useState(() => new SessionStore())
  const [stateManager] = useState(() => new StateManager())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [budgetResults, setBudgetResults] = useState<BudgetResult[]>([])
  const [serverMode] = useState(() => stateManager.isServerMode())

  useEffect(() => {
    async function load() {
      try {
        const sessions = await loadAllSessions(stateManager)
        store.addSessions(sessions)
        const budgets = stateManager.loadBudgets()
        if (budgets.length > 0) setBudgetResults(checkBudgets(budgets, store.getAllSessions()))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
      } finally { setLoading(false) }
    }
    load()
  }, [])

  return { store, budgetResults, loading, error, serverMode }
}
