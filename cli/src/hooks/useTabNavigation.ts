import { useState, useCallback } from 'react'
import { useInput } from 'ink'
import { filterSlashCommands } from '../commands.js'

export type TabName = 'overview' | 'models' | 'daily' | 'repos' | 'budget' | 'sessions' | 'insights' | 'rules' | 'attribution' | 'hooks'

const TABS: TabName[] = ['overview', 'models', 'daily', 'repos', 'budget', 'sessions', 'insights', 'rules', 'attribution', 'hooks']
const TAB_LABELS: Record<TabName, string> = {
  overview: 'Overview', models: 'Models', daily: 'Daily',
  repos: 'Repos', budget: 'Budget', sessions: 'Sessions',
  insights: 'Insights', rules: 'Rules', attribution: 'Attribution', hooks: 'Hooks',
}

export { TABS, TAB_LABELS }

export function useTabNavigation(initialTab: TabName = 'overview') {
  const [activeTab, setActiveTab] = useState<TabName>(initialTab)
  const [commandMode, setCommandMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [cmdIdx, setCmdIdx] = useState(0)
  const [showHelp, setShowHelp] = useState(false)

  const handleInput = useCallback((input: string, key: any, onQuit: () => void, onCommand?: (cmd: string) => void) => {
    if (showHelp) {
      if (key.escape || input === '?' || input === 'q') setShowHelp(false)
      return
    }

    if (commandMode) {
      const sugg = filterSlashCommands(commandInput.slice(1))
      const idx = Math.min(cmdIdx, Math.max(0, sugg.length - 1))
      const reset = () => { setCommandInput(''); setCommandMode(false); setCmdIdx(0) }

      if (key.upArrow) { setCmdIdx(Math.max(0, idx - 1)); return }
      if (key.downArrow) { setCmdIdx(Math.min(sugg.length - 1, idx + 1)); return }
      if (key.tab) {
        const s = sugg[idx]
        if (s) { setCommandInput('/' + s.name + (s.hint ? ' ' : '')); setCmdIdx(0) }
        return
      }
      if (key.return) {
        const typed = commandInput.slice(1).trim()
        const s = sugg[idx]
        if (s) {
          const hasArgs = typed.startsWith(s.name + ' ') && typed.length > s.name.length + 1
          if (!hasArgs) {
            if (s.hint) { setCommandInput('/' + s.name + ' '); setCmdIdx(0); return } // needs args → complete name
            if (onCommand) onCommand('/' + s.name); reset(); return                    // no args → run
          }
        }
        if (onCommand && typed) onCommand('/' + typed)
        reset(); return
      }
      if (key.escape) { reset(); return }
      if (key.backspace || key.delete) {
        if (commandInput.length <= 1) reset()
        else { setCommandInput(commandInput.slice(0, -1)); setCmdIdx(0) }
        return
      }
      if (input && !key.ctrl && !key.meta) { setCommandInput(commandInput + input); setCmdIdx(0) }
      return
    }

    if (input === '/') { setCommandMode(true); setCommandInput('/'); setCmdIdx(0); return }
    if (input === '?') { setShowHelp(true); return }
    if (input === 'q') { onQuit(); return }

    // Number keys 1-6 for tabs, 7-9 + 0 for new tabs
    const num = parseInt(input)
    if (num >= 1 && num <= 9) { setActiveTab(TABS[num - 1]); return }
    if (input === '0') { setActiveTab(TABS[9]); return }

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
  }, [activeTab, commandMode, commandInput, cmdIdx, showHelp])

  const commandSuggestions = commandMode ? filterSlashCommands(commandInput.slice(1)) : []
  const commandSelected = Math.min(cmdIdx, Math.max(0, commandSuggestions.length - 1))

  return { activeTab, setActiveTab, commandMode, commandInput, commandSuggestions, commandSelected, showHelp, setShowHelp, handleInput, TABS, TAB_LABELS }
}
