import React from 'react'
import { Box, Text, useInput } from 'ink'
import { Loading } from './components/Loading.js'
import { TabBar } from './components/TabBar.js'
import { StatusBar } from './components/StatusBar.js'
import { HelpOverlay } from './components/HelpOverlay.js'
import { BudgetAlert } from './components/BudgetBar.js'
import { OverviewTab } from './components/OverviewTab.js'
import { ModelsTab } from './components/ModelsTab.js'
import { DailyTab } from './components/DailyTab.js'
import { ReposTab } from './components/ReposTab.js'
import { BudgetTab } from './components/BudgetTab.js'
import { SessionsTab } from './components/SessionsTab.js'
import { useTabNavigation } from './hooks/useTabNavigation.js'
import { useSessions } from './hooks/useSessions.js'

interface AppProps { onExit: () => void }

export function App({ onExit }: AppProps) {
  const { store, budgetResults, loading, error, serverMode } = useSessions()
  const { activeTab, commandMode, commandInput, showHelp, handleInput } = useTabNavigation()

  useInput((input, key) => {
    handleInput(input, key, onExit)
  })

  if (loading) return <Loading />
  if (error) return (
    <Box flexDirection="column" paddingX={1}>
      <Text color="red" bold>Error: {error}</Text>
    </Box>
  )

  if (showHelp) {
    return (
      <Box flexDirection="column">
        <TabBar activeTab={activeTab} />
        <HelpOverlay serverMode={serverMode} />
      </Box>
    )
  }

  const alerts = budgetResults.filter(r => r.alert)

  function renderTab() {
    switch (activeTab) {
      case 'overview': return <OverviewTab store={store} budgetResults={budgetResults} />
      case 'models': return <ModelsTab store={store} />
      case 'daily': return <DailyTab store={store} />
      case 'repos': return <ReposTab store={store} />
      case 'budget': return <BudgetTab results={budgetResults} />
      case 'sessions': return <SessionsTab sessions={store.getRecentSessions(50)} />
    }
  }

  return (
    <Box flexDirection="column">
      <TabBar activeTab={activeTab} />
      {alerts.map(r => <BudgetAlert key={r.budget.id} result={r} />)}
      {renderTab()}
      <Box marginTop={1}>
        <StatusBar tab={activeTab} commandMode={commandMode} commandInput={commandInput} />
      </Box>
    </Box>
  )
}
