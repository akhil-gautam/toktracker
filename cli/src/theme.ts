import chalk from 'chalk'

export const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4-6': '#E8A838',
  'claude-sonnet-4-6': '#7C6FE0',
  'claude-sonnet-4-5-20250929': '#9B8FEA',
  'claude-haiku-4-5-20251001': '#5CB8B2',
  'gpt-4.1': '#4CAF50',
  'gpt-4.1-mini': '#81C784',
  'gpt-4.1-nano': '#A5D6A7',
  'gpt-5.4': '#2196F3',
  'gpt-5.3-codex': '#42A5F5',
  'o3': '#FF7043',
  'o4-mini': '#FF8A65',
  'gemini-2.5-pro': '#EC407A',
  'gemini-2.5-flash': '#F48FB1',
  'google/gemini-3.1-pro-preview': '#EC407A',
}

export const TOOL_COLORS: Record<string, string> = {
  claude_code: '#E8A838',
  codex: '#4CAF50',
  opencode: '#2196F3',
  gemini_cli: '#EC407A',
}

export const TOOL_LABELS: Record<string, string> = {
  claude_code: 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
  gemini_cli: 'Gemini CLI',
}

export function budgetColor(pct: number): string {
  if (pct < 50) return '#4CAF50'
  if (pct < 80) return '#FFC107'
  return '#F44336'
}

export function costColor(amount: number, dailyAvg: number): string {
  if (dailyAvg === 0) return '#4CAF50'
  const ratio = amount / dailyAvg
  if (ratio < 0.8) return '#4CAF50'
  if (ratio < 1.2) return '#FFC107'
  return '#F44336'
}

export const HEADER_GRADIENT = ['#36D1DC', '#5B86E5']

export const BAR_FULL = '\u2588'
export const BAR_EMPTY = '\u2591'
export const BAR_HALF = '\u2593'

export function formatCost(millicents: number): string {
  const dollars = millicents / 100_000
  if (dollars >= 100) return `$${dollars.toFixed(0)}`
  if (dollars >= 10) return `$${dollars.toFixed(1)}`
  return `$${dollars.toFixed(2)}`
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return `${tokens}`
}

export function getModelColor(model: string): string {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model]
  let hash = 0
  for (let i = 0; i < model.length; i++) {
    hash = model.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 60%)`
}
