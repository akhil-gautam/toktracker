import React from 'react'
import { Box, Text } from 'ink'
import type { RepoStats } from '../types.js'
import { formatCost, BAR_FULL, BAR_EMPTY } from '../theme.js'
import { useAnimatedValue } from '../hooks/useAnimatedValue.js'

function RepoRow({ stat, maxCost }: { stat: RepoStats; maxCost: number }) {
  const barWidth = 20
  const pct = maxCost > 0 ? stat.costMillicents / maxCost : 0
  const animatedFill = useAnimatedValue(Math.round(pct * barWidth), 300)
  const filled = BAR_FULL.repeat(animatedFill)
  const empty = BAR_EMPTY.repeat(Math.max(0, barWidth - animatedFill))
  const repoName = stat.repo.length > 28 ? '...' + stat.repo.slice(-25) : stat.repo.padEnd(28)
  return (
    <Box flexDirection="column">
      <Box><Text color="#7C6FE0">{repoName}</Text><Text color="white" bold> {formatCost(stat.costMillicents).padStart(8)} </Text><Text color="#5CB8B2">{filled}</Text><Text color="gray">{empty}</Text><Text color="gray"> {stat.sessionCount} sessions</Text></Box>
      <Box><Text color="gray" dimColor>{'  '}{stat.models.join(', ')}</Text></Box>
    </Box>
  )
}

interface RepoViewProps { repos: RepoStats[] }

export function RepoView({ repos }: RepoViewProps) {
  if (repos.length === 0) return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Repositories</Text></Box>
      <Text color="gray">No repository data found.</Text>
    </Box>
  )
  const maxCost = Math.max(...repos.map(r => r.costMillicents), 1)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}><Text color="cyan" bold>Repositories</Text><Text color="gray"> ({repos.length})</Text></Box>
      {repos.map(stat => <Box key={stat.repo} marginBottom={1}><RepoRow stat={stat} maxCost={maxCost} /></Box>)}
    </Box>
  )
}
