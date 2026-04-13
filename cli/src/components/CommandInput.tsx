import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

export type ViewName = 'dashboard' | 'repos' | 'models' | 'sessions' | 'timeline' | 'budget' | 'budget-set' | 'help'

interface CommandInputProps { onNavigate: (view: ViewName) => void; onQuit: () => void }

const COMMAND_MAP: Record<string, ViewName> = {
  '/dashboard': 'dashboard', '/repos': 'repos', '/models': 'models',
  '/sessions': 'sessions', '/timeline': 'timeline', '/budget': 'budget',
  '/budget set': 'budget-set', '/help': 'help',
}

export function CommandInput({ onNavigate, onQuit }: CommandInputProps) {
  const [input, setInput] = useState('')
  const [active, setActive] = useState(false)

  useInput((ch, key) => {
    if (!active) {
      if (ch === '/') { setActive(true); setInput('/'); return }
      if (ch === 'q') { onQuit(); return }
      if (key.escape) { onNavigate('dashboard'); return }
      return
    }
    if (key.return) {
      const view = COMMAND_MAP[input.trim()]
      if (view) onNavigate(view)
      setInput(''); setActive(false); return
    }
    if (key.escape) { setInput(''); setActive(false); return }
    if (key.backspace || key.delete) {
      if (input.length <= 1) { setInput(''); setActive(false) }
      else setInput(input.slice(0, -1))
      return
    }
    if (ch && !key.ctrl && !key.meta) setInput(input + ch)
  })

  if (!active) return null
  return (
    <Box>
      <Text color="cyan" bold>{'> '}</Text>
      <Text color="white">{input}</Text>
      <Text color="gray">{'\u2588'}</Text>
    </Box>
  )
}
