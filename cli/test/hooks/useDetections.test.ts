import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { DetectionsRepo } from '../../src/db/repository.js'
import { getDb, closeDb } from '../../src/db/connection.js'
import { migrate } from '../../src/db/migrate.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { useDetections } from '../../src/hooks/useDetections.js'

const tmp = join(tmpdir(), `tokscale-hookU-${Date.now()}.db`)

function Probe({ onValue }: { onValue: (n: number) => void }) {
  const dets = useDetections(getDb(tmp), 10)
  React.useEffect(() => { onValue(dets.length) }, [dets.length])
  return null
}

describe('useDetections', () => {
  it('returns recent detections', async () => {
    const db = getDb(tmp); migrate(db)
    new DetectionsRepo(db).insert({ sessionId: 's', ruleId: 'A1_redundant_tool_call', severity: 'warn', summary: 'x', createdAt: 1 })
    let lastLen = -1
    render(React.createElement(Probe, { onValue: (n) => { lastLen = n } }))
    await new Promise(r => setTimeout(r, 50))
    expect(lastLen).toBe(1)
    closeDb()
    for (const s of ['', '-wal', '-shm']) { try { rmSync(tmp + s) } catch {} }
  })
})
