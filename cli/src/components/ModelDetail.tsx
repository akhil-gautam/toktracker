import React from 'react'
import { Box, Text } from 'ink'
import { LineChart } from './LineChart.js'
import { StackedBarWithLegend, donutPalette } from './Donut.js'
import { formatCost, formatTokens, TOOL_COLORS, TOOL_LABELS, BAR_FULL, BAR_EMPTY } from '../theme.js'
import type { ModelDetailStats } from '../types.js'

interface ModelDetailProps {
  detail: ModelDetailStats
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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>{title}</Text>
        {subtitle && <Text color="gray" dimColor>  {subtitle}</Text>}
      </Box>
    </Box>
  )
}

function Separator() {
  return (
    <Box marginTop={1} marginBottom={1}>
      <Text color="#2a3040">{'\u2500'.repeat(70)}</Text>
    </Box>
  )
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
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      {/* 30-day line chart */}
      <SectionHeader title="30-day trend" subtitle="cost per day (USD)" />
      <LineChart
        values={detail.dailyTrend}
        height={8}
        color="#4CAF50"
      />

      <Separator />

      {/* Token breakdown */}
      <SectionHeader title="Token breakdown" />
      <Box>
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
        <MetricCol label="Sessions" value={detail.sessionCount.toLocaleString()} color="white" />
      </Box>

      <Separator />

      {/* Context window usage */}
      <SectionHeader
        title="Context window usage"
        subtitle={`${formatTokens(detail.contextWindow)} per request`}
      />
      <Box>
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

      {(cacheHitRate > 0 || reasoningRate > 0) && (
        <>
          <Separator />
          <SectionHeader title="Efficiency" />
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
        </>
      )}

      {detail.toolUses.length > 0 && (
        <>
          <Separator />
          <SectionHeader title="Tool usage" subtitle="Claude Code tool invocations" />
          <StackedBarWithLegend
            slices={detail.toolUses.slice(0, 8).map((t, i) => ({
              label: t.name,
              value: t.count,
              color: donutPalette(i),
            }))}
          />
        </>
      )}

      {detail.tools.length > 0 && (
        <>
          <Separator />
          <SectionHeader title="CLI client distribution" />
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
        </>
      )}

      {detail.repos.length > 0 && (
        <>
          <Separator />
          <SectionHeader title="Top repos" />
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
        </>
      )}
    </Box>
  )
}
