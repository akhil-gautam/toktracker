import React from 'react'
import { Box, Text, useInput } from 'ink'
import type Database from 'better-sqlite3'
import { useDetections } from '../hooks/useDetections.js'
import { DetectionsRepo, FeatureFlagsRepo } from '../db/repository.js'
import { formatHint } from '../detection/hints/formatters.js'

export function InsightsTab({ db }: { db: Database.Database }) {
  const detections = useDetections(db, 50)
  const [cursor, setCursor] = React.useState(0)
  useInput((input, key) => {
    if (key.upArrow || input === 'k') setCursor(c => Math.max(0, c - 1))
    if (key.downArrow || input === 'j') setCursor(c => Math.min(detections.length - 1, c + 1))
    if (input === 'a' && detections[cursor]?.id) new DetectionsRepo(db).acknowledge(detections[cursor].id!)
    if (input === 'd' && detections[cursor]?.ruleId) {
      const detection = detections[cursor]
      const flagsRepo = new FeatureFlagsRepo(db)
      const existing = flagsRepo.get(detection.ruleId)?.config ?? {}
      flagsRepo.set(detection.ruleId, { ...existing, enabled: false })
      if (detection.id) new DetectionsRepo(db).acknowledge(detection.id)
    }
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Insights (j/k navigate, a acknowledge, d disable rule)</Text>
      {detections.length === 0 ? <Text dimColor>No detections yet.</Text> : detections.map((d, i) => (
        <Text key={d.id} color={severityColor(d.severity)} inverse={i === cursor}>
          [{d.severity.toUpperCase()}] {formatHint({ ruleId: d.ruleId, severity: d.severity as any, summary: d.summary })}
        </Text>
      ))}
    </Box>
  )
}

function severityColor(sev: string): string {
  if (sev === 'block') return 'red'
  if (sev === 'warn') return 'yellow'
  return 'cyan'
}

