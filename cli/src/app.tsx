import React, { useState, useEffect } from 'react'
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

function useTerminalSize() {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  })
  useEffect(() => {
    const onResize = () => setSize({ columns: process.stdout.columns, rows: process.stdout.rows })
    process.stdout.on('resize', onResize)
    return () => { process.stdout.off('resize', onResize) }
  }, [])
  return size
}

interface AppProps { onExit: () => void }

export function App({ onExit }: AppProps) {
  const { rows, columns } = useTerminalSize()
  const { store, budgetResults, loading, error, serverMode } = useSessions()
  const { activeTab, commandMode, commandInput, showHelp, handleInput } = useTabNavigation()

  useInput((input, key) => {
    handleInput(input, key, onExit)
  })

  if (loading) return (
    <Box flexDirection="column" height={rows} justifyContent="center" alignItems="center">
      <Loading />
    </Box>
  )
  if (error) return (
    <Box flexDirection="column" height={rows} justifyContent="center" alignItems="center">
      <Text color="red" bold>Error: {error}</Text>
    </Box>
  )

  if (showHelp) {
    return (
      <Box flexDirection="column" height={rows} width={columns}>
        <TabBar activeTab={activeTab} />
        <Box flexGrow={1}><HelpOverlay serverMode={serverMode} /></Box>
        <StatusBar tab={activeTab} commandMode={commandMode} commandInput={commandInput} />
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
    <Box flexDirection="column" height={rows} width={columns}>
      <TabBar activeTab={activeTab} />
      {alerts.map(r => <BudgetAlert key={r.budget.id} result={r} />)}
      <Box flexGrow={1} flexDirection="column">
        {renderTab()}
      </Box>
      <StatusBar tab={activeTab} commandMode={commandMode} commandInput={commandInput} />
    </Box>
  )
}
