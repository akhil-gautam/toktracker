import { describe, it, expect } from 'vitest'
import { hashSimilarity } from '../../src/embeddings/fallback.js'

describe('hashSimilarity', () => {
  it('1.0 for identical strings', () => {
    expect(hashSimilarity('hello world', 'hello world')).toBeCloseTo(1, 5)
  })
  it('decreases with edit distance', () => {
    const a = hashSimilarity('hello world', 'hello world')
    const b = hashSimilarity('hello world', 'help world')
    expect(b).toBeLessThan(a)
  })
  it('zero for disjoint tokens', () => {
    expect(hashSimilarity('one two three', 'four five six')).toBeLessThan(0.1)
  })
})
