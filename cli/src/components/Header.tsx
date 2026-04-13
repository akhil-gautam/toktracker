import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Gradient from 'ink-gradient'
import BigText from 'ink-big-text'

interface HeaderProps { compact?: boolean }

export function Header({ compact: forceCompact }: HeaderProps) {
  const [compact, setCompact] = useState(forceCompact ?? false)

  useEffect(() => {
    if (forceCompact) return
    const timer = setTimeout(() => setCompact(true), 1500)
    return () => clearTimeout(timer)
  }, [forceCompact])

  if (compact) {
    return (
      <Box marginBottom={1}>
        <Gradient name="vice"><Text bold>{'\u25C6 tokscale'}</Text></Gradient>
        <Text color="gray"> {'\u2014'} </Text>
        <Text color="gray">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Gradient name="vice"><BigText text="tokscale" font="chrome" /></Gradient>
    </Box>
  )
}
