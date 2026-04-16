import React from 'react'
import { Box, Text, useInput } from 'ink'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { installHook, uninstallHook, hookStatus } from '../hook/install.js'
import { HookEventsRepo } from '../db/repository.js'

export function HooksTab({ db }: { db: Database.Database }) {
  const [global, setGlobal] = React.useState(hookStatus(join(homedir(), '.claude', 'settings.json')))
  const [local, setLocal] = React.useState(hookStatus(join(process.cwd(), '.claude', 'settings.json')))
  const latency = new HookEventsRepo(db).latencyPercentiles(500)
  useInput((input) => {
    if (input === 'i') { installHook(join(homedir(), '.claude', 'settings.json')); setGlobal(hookStatus(join(homedir(), '.claude', 'settings.json'))) }
    if (input === 'u') { uninstallHook(join(homedir(), '.claude', 'settings.json')); setGlobal(hookStatus(join(homedir(), '.claude', 'settings.json'))) }
    if (input === 'I') { installHook(join(process.cwd(), '.claude', 'settings.json')); setLocal(hookStatus(join(process.cwd(), '.claude', 'settings.json'))) }
    if (input === 'U') { uninstallHook(join(process.cwd(), '.claude', 'settings.json')); setLocal(hookStatus(join(process.cwd(), '.claude', 'settings.json'))) }
  })
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Hook installation (i/u global, I/U local)</Text>
      <Text>Global: {global.installed ? 'installed' : 'missing'} ({global.kinds.join(',')})</Text>
      <Text>Local: {local.installed ? 'installed' : 'missing'} ({local.kinds.join(',')})</Text>
      <Text>Latency: p50={latency.p50}ms p95={latency.p95}ms (n={latency.count})</Text>
    </Box>
  )
}
