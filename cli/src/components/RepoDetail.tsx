import React from 'react'
import { Box, Text } from 'ink'
import { LineChart } from './LineChart.js'
import { formatCost, formatTokens, getModelColor, TOOL_COLORS, TOOL_LABELS, BAR_FULL, BAR_EMPTY } from '../theme.js'
import type { RepoDetailStats } from '../types.js'

interface RepoDetailProps {
  detail: RepoDetailStats
  accentColor: string
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

function fmtDate(d?: Date): string {
  if (!d) return '-'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function RepoDetail({ detail, accentColor }: RepoDetailProps) {
  const totalTokens = detail.inputTokens + detail.outputTokens
  const maxModelCost = detail.models[0]?.costMillicents ?? 1
  const meaningfulTools = detail.tools.filter(t => t.costMillicents > 0)
  const maxToolCost = meaningfulTools[0]?.costMillicents ?? 1
  const maxBranchCost = detail.branches[0]?.costMillicents ?? 1

  const span = detail.firstSession && detail.lastSession
    ? Math.max(1, Math.ceil((detail.lastSession.getTime() - detail.firstSession.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    : 1
  const avgPerDay = detail.activeDays > 0 ? detail.costMillicents / detail.activeDays : 0

  const leftCol = (
    <Box flexDirection="column" width="50%" paddingRight={1}>
      <SectionHeader title="30-day trend" subtitle="cost per day (USD)" accentColor={accentColor} />
      <LineChart values={detail.dailyTrend} height={6} color={accentColor} xStretch={1} />

      <Box marginTop={1}>
        <SectionHeader title="Token breakdown" accentColor={accentColor} />
      </Box>
      <Box flexWrap="wrap">
        <MetricCol label="Total" value={formatTokens(totalTokens)} color="white" />
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

      <Box marginTop={1}>
        <SectionHeader title="Activity" accentColor={accentColor} />
      </Box>
      <Box flexWrap="wrap">
        <MetricCol label="Sessions" value={detail.sessionCount.toLocaleString()} color="white" />
        <MetricCol label="Active days" value={`${detail.activeDays} / ${span}`} color="white" />
        <MetricCol label="Avg / day" value={formatCost(avgPerDay)} color="white" />
      </Box>
      <Box>
        <Text color="gray" dimColor>First </Text>
        <Text color="white">{fmtDate(detail.firstSession)}</Text>
        <Text color="gray" dimColor>   Last </Text>
        <Text color="white">{fmtDate(detail.lastSession)}</Text>
      </Box>
    </Box>
  )

  const rightCol = (
    <Box flexDirection="column" width="50%" paddingLeft={1}>
      {detail.models.length > 0 && (
        <>
          <SectionHeader title="Models" subtitle={`${detail.models.length} total`} accentColor={accentColor} />
          {detail.models.slice(0, 6).map(m => {
            const barW = 14
            const fill = Math.round((m.costMillicents / maxModelCost) * barW)
            const color = getModelColor(m.model)
            const name = m.model.length > 22 ? m.model.slice(0, 19) + '...' : m.model
            return (
              <Box key={m.model}>
                <Text color={color}>{name.padEnd(22)} </Text>
                <Text color={color}>{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(m.costMillicents).padStart(8)}</Text>
                <Text color="gray">  {String(m.sessionCount).padStart(4)} sess</Text>
              </Box>
            )
          })}
        </>
      )}

      {meaningfulTools.length > 0 && (
        <>
          <Box marginTop={1}>
            <SectionHeader title="CLI client" accentColor={accentColor} />
          </Box>
          {meaningfulTools.map(t => {
            const barW = 14
            const fill = Math.round((t.costMillicents / maxToolCost) * barW)
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

      {detail.branches.length > 0 && (
        <>
          <Box marginTop={1}>
            <SectionHeader title="Branches" subtitle={`top ${Math.min(5, detail.branches.length)} of ${detail.branches.length}`} accentColor={accentColor} />
          </Box>
          {detail.branches.slice(0, 5).map(b => {
            const barW = 12
            const fill = Math.round((b.costMillicents / maxBranchCost) * barW)
            const name = b.branch.length > 20 ? '...' + b.branch.slice(-17) : b.branch
            return (
              <Box key={b.branch}>
                <Text color="#90A4AE">{name.padEnd(20)} </Text>
                <Text color={accentColor}>{BAR_FULL.repeat(fill)}</Text>
                <Text color="gray">{BAR_EMPTY.repeat(Math.max(0, barW - fill))}</Text>
                <Text color="white" bold> {formatCost(b.costMillicents).padStart(8)}</Text>
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
