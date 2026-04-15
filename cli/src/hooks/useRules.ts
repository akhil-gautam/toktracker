import { useEffect, useState } from 'react'
import type Database from 'better-sqlite3'
import { FeatureFlagsRepo } from '../db/repository.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import type { Rule } from '../detection/types.js'

export interface RuleRow {
  id: string
  category: string
  enabled: boolean
  hardBlock: boolean
  thresholds: Record<string, number>
  defaultThresholds: Record<string, number>
}

export function useRules(db: Database.Database, allRules: Rule[]): {
  rows: RuleRow[]
  toggle: (id: string) => void
  setHardBlock: (id: string, on: boolean) => void
  setThreshold: (id: string, key: string, value: number) => void
} {
  const [rows, setRows] = useState<RuleRow[]>([])
  const reload = () => {
    const loader = new ThresholdLoader(db)
    setRows(allRules.map(r => {
      const t = loader.load(r.id, r.defaultThresholds)
      return { id: r.id, category: r.category, enabled: t.enabled, hardBlock: t.hardBlock, thresholds: t.thresholds, defaultThresholds: r.defaultThresholds }
    }))
  }
  useEffect(() => { reload() }, [db])

  const flags = new FeatureFlagsRepo(db)
  const write = (id: string, patch: Record<string, unknown>) => {
    const existing = flags.get(id)?.config ?? {}
    flags.set(id, { ...existing, ...patch })
    reload()
  }

  return {
    rows,
    toggle(id) { const r = rows.find(x => x.id === id); if (r) write(id, { enabled: !r.enabled }) },
    setHardBlock(id, on) { write(id, { hard_block: on }) },
    setThreshold(id, key, value) {
      const r = rows.find(x => x.id === id); if (!r) return
      write(id, { thresholds: { ...r.thresholds, [key]: value } })
    },
  }
}
