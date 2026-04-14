import React from 'react'
import { Box, Text } from 'ink'
import { LineChart } from './LineChart.js'
import { StackedBarWithLegend, donutPalette } from './Donut.js'
import { formatCost, formatTokens, TOOL_COLORS, TOOL_LABELS, BAR_FULL, BAR_EMPTY } from '../theme.js'
import type { ModelDetailStats } from '../types.js'

interface ModelDetailProps {
  detail: ModelDetailStats
  accentColor?: string
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

function SectionHeader({ title, subtitle, accentColor }: { title: string; subtitle?: string; accentColor: string }) {
  return (
    <Box>
      <Text color={accentColor}>{'\u25CF '}</Text>
      <Text color="white" bold>{title.toUpperCase()}</Text>
      {subtitle && <Text color="gray" dimColor>  {subtitle}</Text>}
    </Box>
  )
}

function pct(num: number, total: number): number {
  return total > 0 ? (num / total) * 100 : 0
}

export function ModelDetail({ detail, accentColor = '#7C6FE0' }: ModelDetailProps) {
  const totalInput = detail.inputTokens + detail.cacheReadTokens
  const cacheHitRate = pct(detail.cacheReadTokens, totalInput)
  const reasoningRate = pct(detail.reasoningTokens, detail.outputTokens)
  const avgContextPct = pct(detail.avgInputTokens, detail.contextWindow)
  const peakContextPct = pct(detail.maxInputTokens, detail.contextWindow)

  const maxRepoCost = detail.repos[0]?.costMillicents ?? 1
  const meaningfulTools = detail.tools.filter(t => t.costMillicents > 0)
  const toolMaxCost = meaningfulTools[0]?.costMillicents ?? 1

  const leftCol = (
    <Box flexDirection="column" width="50%" paddingRight={1}>
      <SectionHeader title="30-day trend" subtitle="cost per day (USD)" accentColor={accentColor} />
      <LineChart values={detail.dailyTrend} height={6} color={accentColor} />

      <Box marginTop={1}>
        <SectionHeader title="Token breakdown" accentColor={accentColor} />
      </Box>
      <Box flexWrap="wrap">
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

      <Box marginTop={1}>
        <SectionHeader title="Context window" subtitle={`${formatTokens(detail.contextWindow)} per request`} accentColor={accentColor} />
      </Box>
      <Box>
        <Text color="gray">Avg  </Text>
        <Text color="#4CAF50">{BAR_FULL.repeat(Math.round(avgContextPct / 5))}</Text>
        <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, 20 - Math.round(avgContextPct / 5)))}</Text>
        <Text color="white" bold> {avgContextPct.toFixed(1)}%</Text>
      </Box>
      <Box>
        <Text color="gray">Peak </Text>
        <Text color={peakContextPct > 80 ? '#FF5252' : peakContextPct > 50 ? '#FFC107' : '#4CAF50'}>
          {BAR_FULL.repeat(Math.round(peakContextPct / 5))}
        </Text>
        <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, 20 - Math.round(peakContextPct / 5)))}</Text>
        <Text color="white" bold> {peakContextPct.toFixed(1)}%</Text>
      </Box>

      {(cacheHitRate > 0 || reasoningRate > 0) && (
        <>
          <Box marginTop={1}>
            <SectionHeader title="Efficiency" accentColor={accentColor} />
          </Box>
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
    </Box>
  )

  const rightCol = (
    <Box flexDirection="column" width="50%" paddingLeft={1}>
      {detail.toolUses.length > 0 && (
        <>
          <SectionHeader title="Tool usage" subtitle="Claude Code invocations" accentColor={accentColor} />
          <StackedBarWithLegend
            slices={detail.toolUses.slice(0, 8).map((t, i) => ({
              label: t.name,
              value: t.count,
              color: donutPalette(i),
            }))}
          />
        </>
      )}

      {meaningfulTools.length > 0 && (
        <>
          <Box marginTop={1}>
            <SectionHeader title="CLI client" accentColor={accentColor} />
          </Box>
          {meaningfulTools.map(t => {
            const barW = 16
            const fill = Math.round((t.costMillicents / toolMaxCost) * barW)
            const color = TOOL_COLORS[t.tool] ?? 'white'
            const label = TOOL_LABELS[t.tool] ?? t.tool
            return (
              <Box key={t.tool}>
                <Text color={color}>{label.padEnd(12)} </Text>
                <Text color={color}>{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(t.costMillicents).padStart(8)}</Text>
              </Box>
            )
          })}
        </>
      )}

      {detail.repos.length > 0 && (
        <>
          <Box marginTop={1}>
            <SectionHeader title="Top repos" accentColor={accentColor} />
          </Box>
          {detail.repos.slice(0, 5).map(r => {
            const barW = 14
            const fill = Math.round((r.costMillicents / maxRepoCost) * barW)
            const name = r.repo.length > 22 ? '...' + r.repo.slice(-19) : r.repo
            return (
              <Box key={r.repo}>
                <Text color="#7C6FE0">{name.padEnd(22)} </Text>
                <Text color="#5CB8B2">{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(r.costMillicents).padStart(8)}</Text>
              </Box>
            )
          })}
        </>
      )}
    </Box>
  )

  return (
    <Box marginTop={1} marginBottom={1}
      borderStyle="single"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderLeft
      borderColor={accentColor}
      paddingLeft={2}
      paddingRight={1}
    >
      <Box flexDirection="row" width="100%">
        {leftCol}
        <Box
          borderStyle="single"
          borderTop={false}
          borderBottom={false}
          borderRight={false}
          borderLeft
          borderColor="#2a3040"
          marginX={1}
        />
        {rightCol}
      </Box>
    </Box>
  )
}
