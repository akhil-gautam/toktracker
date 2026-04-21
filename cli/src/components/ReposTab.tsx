import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { ExpandableTable } from './ExpandableTable.js'
import { RepoDetail } from './RepoDetail.js'
import { useExpandableList } from '../hooks/useExpandableList.js'
import { formatCost, getRepoColor, BAR_FULL, BAR_EMPTY } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

interface ReposTabProps { store: SessionStore }

const BAR_WIDTH = 18

export function ReposTab({ store }: ReposTabProps) {
  const allRepos = store.getRepoStats()
  const { cursor, expandedIndex, sortKey, moveUp, moveDown, toggleExpand, sort } = useExpandableList(allRepos, 'cost')

  const sorted = useMemo(() => {
    const copy = [...allRepos]
    switch (sortKey) {
      case 'cost': return copy.sort((a, b) => b.costMillicents - a.costMillicents)
      case 'sessions': return copy.sort((a, b) => b.sessionCount - a.sessionCount)
      case 'name': return copy.sort((a, b) => a.repo.localeCompare(b.repo))
      default: return copy
    }
  }, [allRepos, sortKey])

  const totalCost = allRepos.reduce((s, r) => s + r.costMillicents, 0)
  const totalSessions = allRepos.reduce((s, r) => s + r.sessionCount, 0)
  const maxCost = sorted[0]?.costMillicents ?? 1
  const topRepo = sorted[0]
  const topPct = totalCost > 0 && topRepo ? Math.round((topRepo.costMillicents / totalCost) * 100) : 0

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
    if (key.return) toggleExpand()
    if (input === 'c') sort('cost')
    if (input === 's') sort('sessions')
    if (input === 'n') sort('name')
  })

  if (allRepos.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="gray">No repository data. Sessions need a git working directory.</Text>
      </Box>
    )
  }

  const columns = [
    { label: 'Repository', width: 30 },
    { label: '', width: BAR_WIDTH + 1 },
    { label: 'Cost', width: 10, align: 'right' as const },
    { label: '%', width: 6, align: 'right' as const },
    { label: 'Sessions', width: 10, align: 'right' as const },
    { label: 'Models', width: 9, align: 'right' as const },
  ]

  const rows = sorted.map(stat => {
    const pct = totalCost > 0 ? Math.round((stat.costMillicents / totalCost) * 100) : 0
    const fill = Math.round((stat.costMillicents / maxCost) * BAR_WIDTH)
    const bar = BAR_FULL.repeat(fill) + BAR_EMPTY.repeat(Math.max(0, BAR_WIDTH - fill))
    const detail = store.getRepoDetail(stat.repo)
    const color = getRepoColor(stat.repo)
    const name = stat.repo.length > 28 ? '...' + stat.repo.slice(-25) : stat.repo

    return {
      cells: [
        name,
        bar,
        formatCost(stat.costMillicents),
        `${pct}%`,
        stat.sessionCount.toLocaleString(),
        String(stat.models.length),
      ],
      color,
      cellColors: [undefined, color, undefined, undefined, undefined, undefined],
      expandedContent: detail
        ? <RepoDetail detail={detail} accentColor={color} />
        : <Text color="gray">No detail available</Text>,
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Summary header */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <Text color="cyan" bold>Repositories</Text>
          <Text color="gray"> {'\u2014'} </Text>
          <Text color="gray">{allRepos.length} repos · {totalSessions.toLocaleString()} sessions · {formatCost(totalCost)} total</Text>
        </Box>
        {topRepo && (
          <Box>
            <Text color="gray" dimColor>Top: </Text>
            <Text color={getRepoColor(topRepo.repo)}>{topRepo.repo}</Text>
            <Text color="gray" dimColor>  {topPct}% of spend  ({formatCost(topRepo.costMillicents)})</Text>
          </Box>
        )}
      </Box>

      <ExpandableTable
        columns={columns} rows={rows}
        cursor={cursor} expandedIndex={expandedIndex}
        sortKey={sortKey}
        sortOptions={[
          { key: 'cost', label: 'cost' },
          { key: 'sessions', label: 'sessions' },
          { key: 'name', label: 'name' },
        ]}
      />
    </Box>
  )
}
