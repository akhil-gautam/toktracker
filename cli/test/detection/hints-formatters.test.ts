import { describe, it, expect } from 'vitest'
import { formatHint } from '../../src/detection/hints/formatters.js'

describe('formatHint', () => {
  it('returns ruleId-prefixed summary when no formatter registered', () => {
    const msg = formatHint({ ruleId: 'X_unknown', severity: 'info', summary: 'hello' })
    expect(msg).toContain('X_unknown')
    expect(msg).toContain('hello')
  })
})
