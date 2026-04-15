import { describe, it, expect } from 'vitest'
import { Redactor } from '../../src/redaction/pipeline.js'

describe('Redactor', () => {
  it('applies rules and returns redacted text', () => {
    const r = new Redactor([
      { id: 1, pattern: 'password=\\w+', replacement: 'password=[REDACTED]', enabled: 1, builtin: 1 },
    ])
    expect(r.apply('user=x password=abc123')).toBe('user=x password=[REDACTED]')
  })
  it('skips disabled rules', () => {
    const r = new Redactor([{ id: 1, pattern: 'x', replacement: 'Y', enabled: 0, builtin: 1 }])
    expect(r.apply('xxx')).toBe('xxx')
  })
  it('applies multiple rules in order', () => {
    const r = new Redactor([
      { id: 1, pattern: 'ghp_\\w+', replacement: '[GH_TOKEN]', enabled: 1, builtin: 1 },
      { id: 2, pattern: 'sk-\\w+', replacement: '[API_KEY]', enabled: 1, builtin: 1 },
    ])
    expect(r.apply('ghp_abc sk-xyz')).toBe('[GH_TOKEN] [API_KEY]')
  })
})
