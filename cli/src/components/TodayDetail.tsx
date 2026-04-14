import React from 'react'
import { Box, Text } from 'ink'
import { Sparkline } from './Sparkline.js'
import { formatCost, formatTokens, getModelColor, TOOL_COLORS, TOOL_LABELS, BAR_FULL, BAR_EMPTY } from '../theme.js'
import type { TodayDetailStats } from '../types.js'

interface TodayDetailProps {
  detail: TodayDetailStats
}

const COL_WIDTH = 14

function MetricCol({ label, value, color }: { label: string; value: string; color: string }) {
  const lbl = label.length > COL_WIDTH - 1 ? label.slice(0, COL_WIDTH - 1) : label
  const val = value.length > COL_WIDTH - 1 ? value.slice(0, COL_WIDTH - 1) : value
  return (
    <Box flexDirection="column" width={COL_WIDTH}>
      <Text color="gray" dimColor>{lbl.padEnd(COL_WIDTH)}</Text>
      <Text color={color}>{val.padEnd(COL_WIDTH)}</Text>
    </Box>
  )
}

export function TodayDetail({ detail }: TodayDetailProps) {
  if (detail.sessionCount === 0) {
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text color="gray" dimColor>No sessions today yet.</Text>
      </Box>
    )
  }

  const totalTokens = detail.inputTokens + detail.outputTokens
  const sep = '\u2500'.repeat(58)
  const maxModelCost = detail.models[0]?.costMillicents ?? 1
  const maxToolCost = detail.tools[0]?.costMillicents ?? 1

  // Time range
  const firstTime = detail.firstSession?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '-'
  const lastTime = detail.lastSession?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) ?? '-'

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>Today's Detail</Text>
        <Text color="gray"> {'\u2014'} </Text>
        <Text color="gray">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
      </Box>

      <Box marginBottom={1}><Text color="gray" dimColor>{sep}</Text></Box>

      {/* Token Summary */}
      <Box marginBottom={1} flexDirection="column">
        <Box>
          <MetricCol label="Sessions" value={String(detail.sessionCount)} color="white" />
          <MetricCol label="Total Tokens" value={formatTokens(totalTokens)} color="white" />
          <MetricCol label="Input" value={formatTokens(detail.inputTokens)} color="#64B5F6" />
          <MetricCol label="Output" value={formatTokens(detail.outputTokens)} color="#4CAF50" />
          {detail.cacheReadTokens > 0 && (
            <MetricCol label="Cache Read" value={formatTokens(detail.cacheReadTokens)} color="#FFC107" />
          )}
          {detail.cacheWriteTokens > 0 && (
            <MetricCol label="Cache Write" value={formatTokens(detail.cacheWriteTokens)} color="#FF9800" />
          )}
          {detail.reasoningTokens > 0 && (
            <MetricCol label="Reasoning" value={formatTokens(detail.reasoningTokens)} color="#CE93D8" />
          )}
        </Box>
        <Box marginTop={0}>
          <Text color="gray" dimColor>Active {firstTime} {'\u2192'} {lastTime}</Text>
        </Box>
      </Box>

      {/* Hourly Activity Sparkline */}
      <Box marginBottom={1} flexDirection="column">
        <Text color="gray" dimColor>Hourly activity:</Text>
        <Box>
          <Text color="gray" dimColor>{'00 '}</Text>
          <Sparkline values={detail.hourly} colorScale />
          <Text color="gray" dimColor>{' 23'}</Text>
        </Box>
      </Box>

      <Box marginBottom={1}><Text color="gray" dimColor>{sep}</Text></Box>

      {/* Models Today */}
      <Box marginBottom={1} flexDirection="column">
        <Text color="gray" dimColor>Models:</Text>
        {detail.models.map(m => {
          const barW = 16
          const pct = maxModelCost > 0 ? m.costMillicents / maxModelCost : 0
          const fill = Math.round(pct * barW)
          const color = getModelColor(m.model)
          const name = m.model.length > 22 ? m.model.slice(0, 19) + '...' : m.model
          return (
            <Box key={m.model}>
              <Text color={color}>{name.padEnd(22)} </Text>
              <Text color={color}>{BAR_FULL.repeat(fill)}</Text>
              <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
              <Text color="white" bold> {formatCost(m.costMillicents).padStart(8)}</Text>
              <Text color="gray">  {formatTokens(m.inputTokens + m.outputTokens).padStart(6)} tok  {String(m.sessionCount).padStart(3)} sess</Text>
            </Box>
          )
        })}
      </Box>

      {/* Tools Today */}
      {detail.tools.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="gray" dimColor>Tools:</Text>
          {detail.tools.map(t => {
            const barW = 16
            const pct = maxToolCost > 0 ? t.costMillicents / maxToolCost : 0
            const fill = Math.round(pct * barW)
            const color = TOOL_COLORS[t.tool] ?? 'white'
            const label = TOOL_LABELS[t.tool] ?? t.tool
            return (
              <Box key={t.tool}>
                <Text color={color}>{label.padEnd(22)} </Text>
                <Text color={color}>{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(t.costMillicents).padStart(8)}</Text>
                <Text color="gray">  {String(t.sessionCount).padStart(3)} sessions</Text>
              </Box>
            )
          })}
        </Box>
      )}

      {/* Repos Today */}
      {detail.repos.length > 0 && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>Repos:</Text>
          {detail.repos.slice(0, 5).map(r => {
            const name = r.repo.length > 22 ? '...' + r.repo.slice(-19) : r.repo
            return (
              <Box key={r.repo}>
                <Text color="#7C6FE0">{name.padEnd(22)} </Text>
                <Text color="white" bold>{formatCost(r.costMillicents).padStart(8)}</Text>
                <Text color="gray">  {String(r.sessionCount).padStart(3)} sessions  {r.models.join(', ')}</Text>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
