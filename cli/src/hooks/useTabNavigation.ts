import { useState, useCallback } from 'react'
import { useInput } from 'ink'

export type TabName = 'overview' | 'models' | 'daily' | 'repos' | 'budget' | 'sessions'

const TABS: TabName[] = ['overview', 'models', 'daily', 'repos', 'budget', 'sessions']
const TAB_LABELS: Record<TabName, string> = {
  overview: 'Overview', models: 'Models', daily: 'Daily',
  repos: 'Repos', budget: 'Budget', sessions: 'Sessions',
}

export { TABS, TAB_LABELS }

export function useTabNavigation(initialTab: TabName = 'overview') {
  const [activeTab, setActiveTab] = useState<TabName>(initialTab)
  const [commandMode, setCommandMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  const handleInput = useCallback((input: string, key: any, onQuit: () => void, onCommand?: (cmd: string) => void) => {
    if (showHelp) {
      if (key.escape || input === '?' || input === 'q') setShowHelp(false)
      return
    }

    if (commandMode) {
      if (key.return) {
        if (onCommand) onCommand(commandInput.trim())
        setCommandInput(''); setCommandMode(false); return
      }
      if (key.escape) { setCommandInput(''); setCommandMode(false); return }
      if (key.backspace || key.delete) {
        if (commandInput.length <= 1) { setCommandInput(''); setCommandMode(false) }
        else setCommandInput(commandInput.slice(0, -1))
        return
      }
      if (input && !key.ctrl && !key.meta) setCommandInput(commandInput + input)
      return
    }

    if (input === '/') { setCommandMode(true); setCommandInput('/'); return }
    if (input === '?') { setShowHelp(true); return }
    if (input === 'q') { onQuit(); return }

    // Number keys 1-6 for tabs
    const num = parseInt(input)
    if (num >= 1 && num <= 6) { setActiveTab(TABS[num - 1]); return }

    // Arrow keys for tab cycling
    if (key.leftArrow) {
      const idx = TABS.indexOf(activeTab)
      setActiveTab(TABS[(idx - 1 + TABS.length) % TABS.length])
      return
    }
    if (key.rightArrow) {
      const idx = TABS.indexOf(activeTab)
      setActiveTab(TABS[(idx + 1) % TABS.length])
      return
    }
  }, [activeTab, commandMode, commandInput, showHelp])

  return { activeTab, setActiveTab, commandMode, commandInput, showHelp, setShowHelp, handleInput, TABS, TAB_LABELS }
}
