import React, { useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { ExpandableTable } from './ExpandableTable.js'
import { Sparkline } from './Sparkline.js'
import { useExpandableList } from '../hooks/useExpandableList.js'
import { formatCost, formatTokens, getModelColor } from '../theme.js'
import type { SessionStore } from '../services/session-store.js'

interface ModelsTabProps { store: SessionStore }

export function ModelsTab({ store }: ModelsTabProps) {
  const allModels = store.getModelStats()
  const trends = store.getModelTrends()
  const { cursor, expandedIndex, sortKey, moveUp, moveDown, toggleExpand, sort } = useExpandableList(allModels, 'cost')

  const sorted = useMemo(() => {
    const copy = [...allModels]
    switch (sortKey) {
      case 'cost': return copy.sort((a, b) => b.costMillicents - a.costMillicents)
      case 'tokens': return copy.sort((a, b) => (b.inputTokens + b.outputTokens) - (a.inputTokens + a.outputTokens))
      case 'sessions': return copy.sort((a, b) => b.sessionCount - a.sessionCount)
      case 'name': return copy.sort((a, b) => a.model.localeCompare(b.model))
      default: return copy
    }
  }, [allModels, sortKey])

  const totalCost = allModels.reduce((s, m) => s + m.costMillicents, 0)

  useInput((input, key) => {
    if (key.upArrow || input === 'k') moveUp()
    if (key.downArrow || input === 'j') moveDown()
    if (key.return) toggleExpand()
    if (input === 'c') sort('cost')
    if (input === 't') sort('tokens')
    if (input === 's') sort('sessions')
    if (input === 'n') sort('name')
  })

  const columns = [
    { label: 'Model', width: 26 },
    { label: 'Cost', width: 10, align: 'right' as const },
    { label: '%', width: 6, align: 'right' as const },
    { label: 'Sessions', width: 10, align: 'right' as const },
  ]

  const rows = sorted.map(stat => {
    const pct = totalCost > 0 ? Math.round((stat.costMillicents / totalCost) * 100) : 0
    const modelTrend = trends[stat.model] ?? []

    return {
      cells: [
        stat.model.length > 24 ? stat.model.slice(0, 21) + '...' : stat.model,
        formatCost(stat.costMillicents),
        `${pct}%`,
        String(stat.sessionCount),
      ],
      color: getModelColor(stat.model),
      expandedContent: (
        <Box flexDirection="column">
          <Box><Text color="gray" dimColor>{'│'} </Text><Sparkline values={modelTrend} color={getModelColor(stat.model)} /><Text color="gray"> 7d trend</Text></Box>
          <Box><Text color="gray" dimColor>{'│'} In: {formatTokens(stat.inputTokens)}  Out: {formatTokens(stat.outputTokens)}</Text></Box>
        </Box>
      ),
    }
  })

  return (
    <Box flexDirection="column" paddingX={1}>
      <ExpandableTable
        columns={columns} rows={rows}
        cursor={cursor} expandedIndex={expandedIndex}
        sortKey={sortKey}
        sortOptions={[
          { key: 'cost', label: 'cost' },
          { key: 'tokens', label: 'tokens' },
          { key: 'sessions', label: 'sessions' },
          { key: 'name', label: 'name' },
        ]}
      />
    </Box>
  )
}
