import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'
import { Loading } from './components/Loading.js'
import { Dashboard } from './components/Dashboard.js'
import { HelpView } from './components/HelpView.js'
import { SessionList } from './components/SessionList.js'
import { RepoView } from './components/RepoView.js'
import { TimelineView } from './components/TimelineView.js'
import { ModelView } from './components/ModelView.js'
import { BudgetView } from './components/BudgetView.js'
import { BudgetAlert } from './components/BudgetBar.js'
import { CommandInput, type ViewName } from './components/CommandInput.js'
import { useSessions } from './hooks/useSessions.js'

interface AppProps { onExit: () => void }

export function App({ onExit }: AppProps) {
  const { store, budgetResults, loading, error, serverMode } = useSessions()
  const [view, setView] = useState<ViewName>('dashboard')
  const handleNavigate = useCallback((newView: ViewName) => { setView(newView) }, [])

  if (loading) return <Loading />
  if (error) return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="red" bold>Error: {error}</Text>
      <Text color="gray">Check that session file directories exist and are readable.</Text>
    </Box>
  )

  const alerts = budgetResults.filter(r => r.alert)

  function renderView() {
    switch (view) {
      case 'dashboard': return <Dashboard store={store} />
      case 'help': return <HelpView serverMode={serverMode} />
      case 'sessions': return <SessionList sessions={store.getRecentSessions(30)} />
      case 'repos': return <RepoView repos={store.getRepoStats()} />
      case 'timeline': return <TimelineView days={store.getWeekStats()} />
      case 'models': return <ModelView models={store.getModelStats()} />
      case 'budget': return <BudgetView results={budgetResults} />
      default: return <Dashboard store={store} />
    }
  }

  return (
    <Box flexDirection="column">
      {alerts.map(r => <BudgetAlert key={r.budget.id} result={r} />)}
      {renderView()}
      <CommandInput onNavigate={handleNavigate} onQuit={onExit} />
    </Box>
  )
}
