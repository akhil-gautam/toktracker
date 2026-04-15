import { describe, it, expect } from 'vitest'
import { sha256, normalizeArgs, extractTargetPath } from '../../src/capture/hashing.js'

describe('sha256', () => {
  it('is deterministic', () => {
    expect(sha256('hello')).toBe(sha256('hello'))
  })
  it('differs on different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'))
  })
})

describe('normalizeArgs', () => {
  it('sorts keys and produces canonical JSON', () => {
    expect(normalizeArgs({ b: 2, a: 1 })).toBe(normalizeArgs({ a: 1, b: 2 }))
  })
  it('handles nested objects', () => {
    expect(normalizeArgs({ x: { z: 2, y: 1 } })).toBe(normalizeArgs({ x: { y: 1, z: 2 } }))
  })
})

describe('extractTargetPath', () => {
  it('returns file_path when present', () => {
    expect(extractTargetPath('Read', { file_path: '/x/y.ts' })).toBe('/x/y.ts')
  })
  it('returns path for Write', () => {
    expect(extractTargetPath('Write', { path: '/a' })).toBe('/a')
  })
  it('returns null when absent', () => {
    expect(extractTargetPath('Bash', { command: 'ls' })).toBeNull()
  })
})
