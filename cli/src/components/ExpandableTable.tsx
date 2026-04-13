import React from 'react'
import { Box, Text } from 'ink'

interface Column {
  label: string
  width: number
  align?: 'left' | 'right'
}

interface ExpandableTableProps {
  columns: Column[]
  rows: Array<{
    cells: string[]
    color?: string
    expandedContent?: React.ReactNode
  }>
  cursor: number
  expandedIndex: number | null
  sortKey?: string
  sortOptions?: Array<{ key: string; label: string }>
}

export function ExpandableTable({ columns, rows, cursor, expandedIndex, sortKey, sortOptions }: ExpandableTableProps) {
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text color="gray">  </Text>
        {columns.map((col, i) => (
          <Text key={i} color="gray" dimColor>
            {col.align === 'right' ? col.label.padStart(col.width) : col.label.padEnd(col.width)}
          </Text>
        ))}
      </Box>
      <Box><Text color="gray" dimColor>  {'─'.repeat(columns.reduce((s, c) => s + c.width, 0) + 2)}</Text></Box>

      {/* Rows */}
      {rows.map((row, idx) => {
        const isExpanded = expandedIndex === idx
        const isCursor = cursor === idx
        const arrow = isExpanded ? '\u25BE' : '\u25B8'
        const bgProps = isCursor ? { backgroundColor: '#1e2a3a' } : {}

        return (
          <React.Fragment key={idx}>
            <Box {...bgProps}>
              <Text color={row.color ?? 'white'}>{isCursor ? '\u25B8' : ' '} {arrow} </Text>
              {row.cells.map((cell, ci) => (
                <Text key={ci} color={ci === 0 ? (row.color ?? 'white') : (ci === 1 ? 'white' : 'gray')} bold={ci === 1}>
                  {columns[ci]?.align === 'right' ? cell.padStart(columns[ci].width) : cell.padEnd(columns[ci].width)}
                </Text>
              ))}
            </Box>
            {isExpanded && row.expandedContent && (
              <Box flexDirection="column" paddingLeft={4} marginBottom={1}>
                <Text color="gray" dimColor>{'│'}</Text>
                {row.expandedContent}
                <Text color="gray" dimColor>{'└' + '─'.repeat(45)}</Text>
              </Box>
            )}
          </React.Fragment>
        )
      })}

      {/* Sort hints */}
      {sortOptions && sortOptions.length > 0 && (
        <Box marginTop={1}>
          <Text color="gray" dimColor>Sort: </Text>
          {sortOptions.map((opt, i) => (
            <React.Fragment key={opt.key}>
              {i > 0 && <Text color="gray" dimColor>  </Text>}
              <Text color={sortKey === opt.key ? 'cyan' : 'gray'} bold={sortKey === opt.key}>
                [{opt.key.charAt(0)}]{opt.label.slice(1)}
              </Text>
            </React.Fragment>
          ))}
        </Box>
      )}
    </Box>
  )
}
