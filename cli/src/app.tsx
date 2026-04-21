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
import { InsightsTab } from './components/InsightsTab.js'
import { RulesTab } from './components/RulesTab.js'
import { AttributionTab } from './components/AttributionTab.js'
import { HooksTab } from './components/HooksTab.js'
import { ContextHud } from './components/ContextHud.js'
import { ClaudeMdOverlay } from './components/ClaudeMdOverlay.js'
import { SavedCommandOverlay } from './components/SavedCommandOverlay.js'
import { useTabNavigation } from './hooks/useTabNavigation.js'
import { useSessions } from './hooks/useSessions.js'
import { bootDb } from './db/boot.js'

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
  const db = React.useMemo(() => bootDb(), [])
  const [overlay, setOverlay] = React.useState<'claude_md' | 'saved_cmd' | null>(null)

  const unread = React.useMemo(() => {
    try {
      return (db.prepare('SELECT COUNT(*) as c FROM detections WHERE acknowledged_at IS NULL').get() as { c: number }).c
    } catch {
      return 0
    }
  }, [db, activeTab])

  useInput((input, key) => {
    if (overlay) return
    if (input === '!') { setOverlay('claude_md'); return }
    if (input === '@') { setOverlay('saved_cmd'); return }
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

  if (overlay === 'claude_md') {
    return (
      <Box flexDirection="column" height={rows} width={columns}>
        <ClaudeMdOverlay db={db} onClose={() => setOverlay(null)} />
      </Box>
    )
  }

  if (overlay === 'saved_cmd') {
    return (
      <Box flexDirection="column" height={rows} width={columns}>
        <SavedCommandOverlay db={db} onClose={() => setOverlay(null)} />
      </Box>
    )
  }

  if (showHelp) {
    return (
      <Box flexDirection="column" height={rows} width={columns}>
        <TabBar activeTab={activeTab} unreadDetections={unread} />
        <Box flexGrow={1}><HelpOverlay serverMode={serverMode} /></Box>
        <StatusBar tab={activeTab} commandMode={commandMode} commandInput={commandInput} />
      </Box>
    )
  }

  const alerts = budgetResults.filter(r => r.alert)

  function renderTab() {
    switch (activeTab) {
      case 'overview': return <OverviewTab store={store} budgetResults={budgetResults} db={db} />
      case 'models': return <ModelsTab store={store} />
      case 'daily': return <DailyTab store={store} />
      case 'repos': return <ReposTab store={store} />
      case 'budget': return <BudgetTab results={budgetResults} />
      case 'sessions': return <SessionsTab sessions={store.getRecentSessions(500)} viewportHeight={Math.max(5, rows - 10)} />
      case 'insights': return <InsightsTab db={db} />
      case 'rules': return <RulesTab db={db} />
      case 'attribution': return <AttributionTab db={db} />
      case 'hooks': return <HooksTab db={db} />
    }
  }

  return (
    <Box flexDirection="column" height={rows} width={columns}>
      <Box justifyContent="space-between">
        <TabBar activeTab={activeTab} unreadDetections={unread} />
        <ContextHud db={db} sessionId={undefined} />
      </Box>
      {alerts.map(r => <BudgetAlert key={r.budget.id} result={r} />)}
      <Box flexGrow={1} flexDirection="column">
        {renderTab()}
      </Box>
      <StatusBar tab={activeTab} commandMode={commandMode} commandInput={commandInput} />
    </Box>
  )
}
