import React from 'react'
import { Box, Text } from 'ink'
import type Database from 'better-sqlite3'
import { usePrAttributions, useCommitAttributions } from '../hooks/usePrAttributions.js'

function shortSha(sha: string): string { return sha.slice(0, 7) }

function relativeTime(ms: number | null | undefined): string {
  if (!ms) return '—'
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`
  if (secs < 30 * 86_400) return `${Math.floor(secs / 86_400)}d ago`
  return `${Math.floor(secs / (30 * 86_400))}mo ago`
}

export function AttributionTab({ db }: { db: Database.Database }) {
  const prs = usePrAttributions(db)
  const commits = useCommitAttributions(db, 15)
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Cost per merged PR</Text>
      {prs.length === 0
        ? <Text dimColor>No PR attributions yet.</Text>
        : prs.map(r => (
          <Text key={`${r.repo}#${r.prNumber}`}>
            {r.repo} #{r.prNumber}
            {r.title ? <Text dimColor> — {r.title}</Text> : null}
            {' '}· ${(r.costCents / 100).toFixed(2)} · {r.sessions} session{r.sessions === 1 ? '' : 's'}
          </Text>
        ))}

      <Box marginTop={1}>
        <Text bold>Commits linked to sessions</Text>
      </Box>
      {commits.length === 0
        ? <Text dimColor>No commit attributions yet.</Text>
        : commits.map(c => (
          <Text key={`${c.repo}@${c.sha}`}>
            <Text color="cyan">{shortSha(c.sha)}</Text>
            {' '}{c.repo}
            {c.branch ? <Text dimColor> [{c.branch}]</Text> : null}
            {' '}· {relativeTime(c.committedAt)}
            {' '}· ${((c.cost ?? 0) / 100_000).toFixed(2)}
            {c.subject ? <Text dimColor> — {c.subject}</Text> : null}
          </Text>
        ))}
    </Box>
  )
}
