import { createHash } from 'node:crypto'

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function normalizeArgs(args: unknown): string {
  return JSON.stringify(sortKeys(args))
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k])
    }
    return out
  }
  return v
}

const TARGET_KEYS: Record<string, string[]> = {
  Read: ['file_path', 'path'],
  Write: ['file_path', 'path'],
  Edit: ['file_path', 'path'],
  Grep: ['path'],
  Glob: ['path'],
  NotebookEdit: ['notebook_path'],
}

export function extractTargetPath(toolName: string, args: unknown): string | null {
  const keys = TARGET_KEYS[toolName] ?? ['file_path', 'path']
  if (!args || typeof args !== 'object') return null
  const obj = args as Record<string, unknown>
  for (const k of keys) {
    if (typeof obj[k] === 'string') return obj[k] as string
  }
  return null
}
