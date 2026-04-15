import { describe, it, expect } from 'vitest'
import { SessionStateCache } from '../../src/capture/session-state.js'

describe('SessionStateCache', () => {
  it('tracks tool call args per session', () => {
    const cache = new SessionStateCache()
    cache.recordToolCall('s1', 'Read', 'hashA')
    cache.recordToolCall('s1', 'Read', 'hashA')
    expect(cache.countToolCalls('s1', 'Read', 'hashA')).toBe(2)
    expect(cache.countToolCalls('s1', 'Read', 'hashB')).toBe(0)
  })
  it('tracks cumulative tokens per session', () => {
    const cache = new SessionStateCache()
    cache.addTokens('s2', { input: 10, output: 5 })
    cache.addTokens('s2', { input: 20, output: 8 })
    const totals = cache.tokens('s2')
    expect(totals.input).toBe(30)
    expect(totals.output).toBe(13)
  })
  it('tracks failed-call count', () => {
    const cache = new SessionStateCache()
    cache.recordToolResult('s3', { succeeded: false })
    cache.recordToolResult('s3', { succeeded: false })
    cache.recordToolResult('s3', { succeeded: true })
    expect(cache.failedCount('s3')).toBe(2)
  })
  it('flushes on demand', () => {
    const cache = new SessionStateCache()
    cache.recordToolCall('s4', 'Read', 'h')
    cache.flush('s4')
    expect(cache.countToolCalls('s4', 'Read', 'h')).toBe(0)
  })
})
