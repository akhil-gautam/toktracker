import { describe, it, expect } from 'vitest'
import { supportsPayload } from '../../src/hook/schema-version.js'

describe('supportsPayload', () => {
  it('known field set → supported', () => {
    expect(supportsPayload({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'X', tool_input: {} }).supported).toBe(true)
  })
  it('missing hook_event_name → unsupported', () => {
    expect(supportsPayload({ session_id: 's' }).supported).toBe(false)
  })
  it('extra unknown fields → supported (forward compatible)', () => {
    expect(supportsPayload({ hook_event_name: 'PreToolUse', future_field: 42 }).supported).toBe(true)
  })
})
