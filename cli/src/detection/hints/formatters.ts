import type { Detection } from '../types.js'

type Formatter = (d: Detection) => string

const registry = new Map<string, Formatter>()

export function registerFormatter(ruleId: string, fmt: Formatter): void {
  registry.set(ruleId, fmt)
}

export function formatHint(detection: Detection): string {
  const fmt = registry.get(detection.ruleId)
  if (fmt) return fmt(detection)
  return `[${detection.ruleId}] ${detection.summary}`
}
