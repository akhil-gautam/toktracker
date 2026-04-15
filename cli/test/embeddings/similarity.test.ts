import { describe, it, expect } from 'vitest'
import { cosine } from '../../src/embeddings/similarity.js'

describe('cosine', () => {
  it('1 for identical vectors', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })
  it('0 for orthogonal', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })
  it('returns 0 for zero-length input', () => {
    expect(cosine([], [])).toBe(0)
  })
})
