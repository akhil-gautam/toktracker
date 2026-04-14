import { useState, useEffect, useCallback } from 'react'
import { existsSync } from 'fs'
import { watch } from 'chokidar'
import { SessionStore } from '../services/session-store.js'
import { StateManager } from '../services/state-manager.js'
import { loadAllSessions, parseChangedFile, WATCH_PATHS } from '../parsers/index.js'
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
  // Counter to trigger re-renders when store updates
  const [, setUpdateTick] = useState(0)

  const refreshBudgets = useCallback(() => {
    const budgets = stateManager.loadBudgets()
    if (budgets.length > 0) {
      setBudgetResults(checkBudgets(budgets, store.getAllSessions()))
    }
  }, [store, stateManager])

  useEffect(() => {
    let watcher: ReturnType<typeof watch> | null = null

    async function load() {
      try {
        const sessions = await loadAllSessions(stateManager)
        store.addSessions(sessions)
        refreshBudgets()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sessions')
      } finally {
        setLoading(false)
      }

      // Start watching for live updates
      const existingPaths = WATCH_PATHS.filter(p => existsSync(p))
      if (existingPaths.length === 0) return

      watcher = watch(existingPaths, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
        depth: 10,
      })

      watcher.on('change', async (filePath: string) => {
        const newSessions = await parseChangedFile(filePath, stateManager)
        if (newSessions.length > 0) {
          store.addSessions(newSessions)
          refreshBudgets()
          setUpdateTick(t => t + 1) // trigger re-render
        }
      })

      watcher.on('add', async (filePath: string) => {
        const newSessions = await parseChangedFile(filePath, stateManager)
        if (newSessions.length > 0) {
          store.addSessions(newSessions)
          refreshBudgets()
          setUpdateTick(t => t + 1)
        }
      })
    }

    load()

    return () => { watcher?.close() }
  }, [])

  return { store, budgetResults, loading, error, serverMode }
}
