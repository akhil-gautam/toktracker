import React from 'react'
import { Box, Text, useInput } from 'ink'
import { ExpandableTable } from './ExpandableTable.js'
import { useExpandableList } from '../hooks/useExpandableList.js'
import { formatCost } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

interface ReposTabProps { store: SessionStore }

export function ReposTab({ store }: ReposTabProps) {
  const repos = store.getRepoStats()
  const { cursor, expandedIndex, moveUp, moveDown, toggleExpand } = useExpandableList(repos)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
    if (key.return) toggleExpand()
  })

  const columns = [
    { label: 'Repository', width: 28 },
    { label: 'Cost', width: 10, align: 'right' as const },
    { label: 'Sessions', width: 10, align: 'right' as const },
  ]

  const rows = repos.map(stat => ({
    cells: [
      stat.repo.length > 26 ? '...' + stat.repo.slice(-23) : stat.repo,
      formatCost(stat.costMillicents),
      String(stat.sessionCount),
    ],
    color: '#7C6FE0',
    expandedContent: (
      <Box flexDirection="column">
        <Box><Text color="gray" dimColor>{'│'} Models: {stat.models.join(', ')}</Text></Box>
      </Box>
    ),
  }))

  if (repos.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">No repository data. Sessions need a git working directory.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <ExpandableTable columns={columns} rows={rows} cursor={cursor} expandedIndex={expandedIndex} />
    </Box>
  )
}
