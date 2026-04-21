import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { homedir } from 'node:os'

export interface ClaudeMdResult { absolutePath: string; relativePath: string }

const HOT_PATHS_START = '<!-- tokscale:hot-paths -->'
const HOT_PATHS_END = '<!-- /tokscale:hot-paths -->'
const CORRECTIONS_START = '<!-- tokscale:corrections -->'
const CORRECTIONS_END = '<!-- /tokscale:corrections -->'

/// Upserts a "hot path" note into `<repoRoot>/CLAUDE.md`. `filePath` is an
/// absolute path inside the repo; we walk up to `.git` to find the root.
export function appendHotPath(filePath: string, sessions: number): ClaudeMdResult {
  const root = findRepoRoot(filePath)
  if (!root) throw new Error('No .git directory found above this file')
  const rel = relative(root, filePath)
  const claudeMd = join(root, 'CLAUDE.md')
  const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : ''
  const entry = `- \`${rel}\` — touched across ${sessions} sessions`
  const updated = upsertBlock(existing, entry, rel, HOT_PATHS_START, HOT_PATHS_END,
    'Hot paths (auto-maintained by Tokscale)')
  writeFileSync(claudeMd, updated, 'utf8')
  return { absolutePath: claudeMd, relativePath: 'CLAUDE.md' }
}

/// Append a recurring-correction rule to `~/.claude/CLAUDE.md`. Correction
/// phrases are usually user-wide preferences; writing to the global home file
/// avoids scattering the same rule across every repo.
export function appendCorrection(phrase: string): ClaudeMdResult {
  const dir = join(homedir(), '.claude')
  mkdirSync(dir, { recursive: true })
  const claudeMd = join(dir, 'CLAUDE.md')
  const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : ''
  const entry = `- Avoid patterns that trigger "${phrase}" corrections`
  const key = `"${phrase.toLowerCase()}"`
  const updated = upsertBlock(existing, entry, key,
    CORRECTIONS_START, CORRECTIONS_END,
    'Recurring corrections (auto-maintained by Tokscale)')
  writeFileSync(claudeMd, updated, 'utf8')
  return { absolutePath: claudeMd, relativePath: '~/.claude/CLAUDE.md' }
}

function upsertBlock(content: string, entry: string, dedupKey: string,
                     start: string, end: string, heading: string): string {
  const startIdx = content.indexOf(start)
  const endIdx = startIdx >= 0 ? content.indexOf(end, startIdx + start.length) : -1
  if (startIdx >= 0 && endIdx > startIdx) {
    const before = content.slice(0, startIdx)
    const block = content.slice(startIdx, endIdx + end.length)
    const after = content.slice(endIdx + end.length)
    // Drop any line that already references this key so re-running replaces
    // rather than duplicates.
    const lines = block.split('\n').filter(line =>
      line === start || line === end || !line.toLowerCase().includes(dedupKey.toLowerCase()))
    const endLineIdx = lines.findIndex(l => l === end)
    lines.splice(endLineIdx, 0, entry)
    return before + lines.join('\n') + after
  }
  const trimmed = content.trim()
  const headerBlock = `\n\n## ${heading}\n\n${start}\n${entry}\n${end}\n`
  if (trimmed.length === 0) return `# CLAUDE.md${headerBlock}`
  return trimmed + headerBlock
}

function findRepoRoot(filePath: string): string | null {
  let dir = dirname(resolve(filePath))
  for (let i = 0; i < 40; i++) {
    const git = join(dir, '.git')
    try {
      statSync(git)
      return dir
    } catch { /* not here, keep walking */ }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}
