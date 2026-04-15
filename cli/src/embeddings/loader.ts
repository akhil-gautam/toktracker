import { modelsDir } from '../db/paths.js'
import { cosine } from './similarity.js'
import { hashSimilarity } from './fallback.js'

let pipelinePromise: Promise<((text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>)> | null = null

export async function getEmbedder(): Promise<((text: string) => Promise<number[]>) | null> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      try {
        const { pipeline, env } = await import('@xenova/transformers')
        env.cacheDir = modelsDir()
        return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2') as any
      } catch {
        throw new Error('transformers unavailable')
      }
    })()
  }
  try {
    const pipe = await pipelinePromise
    return async (text: string) => {
      const out = await pipe(text, { pooling: 'mean', normalize: true })
      return Array.from(out.data)
    }
  } catch {
    return null
  }
}

export async function similarity(a: string, b: string): Promise<number> {
  const embed = await getEmbedder()
  if (!embed) return hashSimilarity(a, b)
  try {
    const [va, vb] = await Promise.all([embed(a), embed(b)])
    return cosine(va, vb)
  } catch {
    return hashSimilarity(a, b)
  }
}
