export interface CompatibilityReport {
  supported: boolean
  missing: string[]
}

export function supportsPayload(payload: Record<string, unknown>): CompatibilityReport {
  const required = ['hook_event_name']
  const missing = required.filter(k => !(k in payload))
  return { supported: missing.length === 0, missing }
}
