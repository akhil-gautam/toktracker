// Model context window sizes (in tokens). Approximate, as of April 2026.
// Used for computing context usage percentages.
export const CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-sonnet-4-5-20250929': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'gpt-4.1': 1_000_000,
  'gpt-4.1-mini': 1_000_000,
  'gpt-4.1-nano': 1_000_000,
  'gpt-5.4': 272_000,
  'gpt-5.3-codex': 272_000,
  'o3': 200_000,
  'o4-mini': 200_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
  'google/gemini-3.1-pro-preview': 1_000_000,
}

export function getContextWindow(model: string): number {
  // Exact match
  if (CONTEXT_WINDOWS[model]) return CONTEXT_WINDOWS[model]
  // Prefix/suffix match
  for (const key of Object.keys(CONTEXT_WINDOWS)) {
    if (model.startsWith(key) || key.startsWith(model)) return CONTEXT_WINDOWS[key]
  }
  // Default fallback
  return 200_000
}
