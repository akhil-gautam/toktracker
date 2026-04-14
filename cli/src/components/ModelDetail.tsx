import React from 'react'
import { Box, Text } from 'ink'
import { LineChart } from './LineChart.js'
import { formatCost, formatTokens, TOOL_COLORS, TOOL_LABELS, BAR_FULL, BAR_EMPTY } from '../theme.js'
import type { ModelDetailStats } from '../types.js'

interface ModelDetailProps {
  detail: ModelDetailStats
}

function pct(num: number, total: number): number {
  return total > 0 ? (num / total) * 100 : 0
}

export function ModelDetail({ detail }: ModelDetailProps) {
  const totalInput = detail.inputTokens + detail.cacheReadTokens
  const cacheHitRate = pct(detail.cacheReadTokens, totalInput)
  const reasoningRate = pct(detail.reasoningTokens, detail.outputTokens)
  const avgContextPct = pct(detail.avgInputTokens, detail.contextWindow)
  const peakContextPct = pct(detail.maxInputTokens, detail.contextWindow)

  const maxToolCost = detail.tools[0]?.costMillicents ?? 1
  const maxRepoCost = detail.repos[0]?.costMillicents ?? 1

  return (
    <Box flexDirection="column" marginTop={0} marginBottom={1}>
      {/* Line chart of 30-day trend */}
      <Box marginBottom={1}>
        <LineChart
          values={detail.dailyTrend}
          height={8}
          color="#4CAF50"
          subtitle="30-day cost trend"
        />
      </Box>

      {/* Token breakdown */}
      <Box marginBottom={1} flexDirection="column">
        <Text color="cyan" bold>Token breakdown</Text>
        <Box gap={3}>
          <Box flexDirection="column">
            <Text color="gray" dimColor>Input</Text>
            <Text color="#64B5F6">{formatTokens(detail.inputTokens)}</Text>
          </Box>
          <Box flexDirection="column">
            <Text color="gray" dimColor>Output</Text>
            <Text color="#4CAF50">{formatTokens(detail.outputTokens)}</Text>
          </Box>
          {detail.cacheReadTokens > 0 && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>Cache Read</Text>
              <Text color="#FFC107">{formatTokens(detail.cacheReadTokens)}</Text>
            </Box>
          )}
          {detail.cacheWriteTokens > 0 && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>Cache Write</Text>
              <Text color="#FF9800">{formatTokens(detail.cacheWriteTokens)}</Text>
            </Box>
          )}
          {detail.reasoningTokens > 0 && (
            <Box flexDirection="column">
              <Text color="gray" dimColor>Reasoning</Text>
              <Text color="#CE93D8">{formatTokens(detail.reasoningTokens)}</Text>
            </Box>
          )}
          <Box flexDirection="column">
            <Text color="gray" dimColor>Sessions</Text>
            <Text color="white">{detail.sessionCount.toLocaleString()}</Text>
          </Box>
        </Box>
      </Box>

      {/* Context window usage */}
      <Box marginBottom={1} flexDirection="column">
        <Text color="cyan" bold>Context window usage</Text>
        <Text color="gray" dimColor>{formatTokens(detail.contextWindow)} window per request</Text>
        <Box marginTop={0}>
          <Text color="gray">Avg  </Text>
          <Text color="#4CAF50">{BAR_FULL.repeat(Math.round(avgContextPct / 5))}</Text>
          <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, 20 - Math.round(avgContextPct / 5)))}</Text>
          <Text color="white" bold> {avgContextPct.toFixed(1)}%</Text>
          <Text color="gray"> ({formatTokens(detail.avgInputTokens)})</Text>
        </Box>
        <Box>
          <Text color="gray">Peak </Text>
          <Text color={peakContextPct > 80 ? '#FF5252' : peakContextPct > 50 ? '#FFC107' : '#4CAF50'}>
            {BAR_FULL.repeat(Math.round(peakContextPct / 5))}
          </Text>
          <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, 20 - Math.round(peakContextPct / 5)))}</Text>
          <Text color="white" bold> {peakContextPct.toFixed(1)}%</Text>
          <Text color="gray"> ({formatTokens(detail.maxInputTokens)})</Text>
        </Box>
      </Box>

      {/* Efficiency metrics */}
      {(cacheHitRate > 0 || reasoningRate > 0) && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="cyan" bold>Efficiency</Text>
          {cacheHitRate > 0 && (
            <Box>
              <Text color="gray">Cache hit rate   </Text>
              <Text color="#4CAF50">{BAR_FULL.repeat(Math.round(cacheHitRate / 5))}</Text>
              <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, 20 - Math.round(cacheHitRate / 5)))}</Text>
              <Text color="white" bold> {cacheHitRate.toFixed(1)}%</Text>
            </Box>
          )}
          {reasoningRate > 0 && (
            <Box>
              <Text color="gray">Reasoning ratio  </Text>
              <Text color="#CE93D8">{BAR_FULL.repeat(Math.round(reasoningRate / 5))}</Text>
              <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, 20 - Math.round(reasoningRate / 5)))}</Text>
              <Text color="white" bold> {reasoningRate.toFixed(1)}%</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Tool distribution */}
      {detail.tools.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="cyan" bold>Tool distribution</Text>
          {detail.tools.map(t => {
            const barW = 20
            const fill = Math.round((t.costMillicents / maxToolCost) * barW)
            const color = TOOL_COLORS[t.tool] ?? 'white'
            const label = TOOL_LABELS[t.tool] ?? t.tool
            return (
              <Box key={t.tool}>
                <Text color={color}>{label.padEnd(14)} </Text>
                <Text color={color}>{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(t.costMillicents).padStart(8)}</Text>
                <Text color="gray">  {t.sessionCount.toLocaleString()} sessions</Text>
              </Box>
            )
          })}
        </Box>
      )}

      {/* Top repos */}
      {detail.repos.length > 0 && (
        <Box flexDirection="column">
          <Text color="cyan" bold>Top repos</Text>
          {detail.repos.slice(0, 5).map(r => {
            const barW = 20
            const fill = Math.round((r.costMillicents / maxRepoCost) * barW)
            const name = r.repo.length > 26 ? '...' + r.repo.slice(-23) : r.repo
            return (
              <Box key={r.repo}>
                <Text color="#7C6FE0">{name.padEnd(26)} </Text>
                <Text color="#5CB8B2">{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(r.costMillicents).padStart(8)}</Text>
                <Text color="gray">  {r.sessionCount.toLocaleString()} sessions</Text>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
