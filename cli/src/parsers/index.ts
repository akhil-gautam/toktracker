import { glob } from 'glob'
import path from 'path'
import { parseClaudeCode } from './claude-code.js'
import { parseCodex } from './codex.js'
import { parseOpenCode } from './opencode.js'
import { parseGeminiCli } from './gemini-cli.js'
import { extractGitInfo } from '../services/git-attribution.js'
import type { Session, ParseResult } from '../types.js'
import type { StateManager } from '../services/state-manager.js'

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '~'

interface ParserDef {
  name: string
  globPattern: string
  parse: (filePath: string, fromOffset: number) => Promise<ParseResult>
}

const PARSERS: ParserDef[] = [
  { name: 'claude_code', globPattern: path.join(HOME, '.claude', 'projects', '**', '*.jsonl'), parse: parseClaudeCode },
  { name: 'codex', globPattern: path.join(HOME, '.codex', 'sessions', '**', '*.jsonl'), parse: parseCodex },
  { name: 'opencode', globPattern: path.join(HOME, '.local', 'share', 'opencode', 'opencode.db'), parse: parseOpenCode },
  { name: 'gemini_cli', globPattern: path.join(HOME, '.gemini', 'tmp', '*', 'chats', '*.json'), parse: parseGeminiCli },
]

// Parse files in parallel batches to saturate I/O without overwhelming memory
const BATCH_SIZE = 50

/**
 * Load all sessions from all parsers.
 * fullScan=true (default): parse from beginning of every file — shows all-time data.
 * fullScan=false: parse only new data since last cursor — for incremental watch mode.
 */
export async function loadAllSessions(stateManager: StateManager, fullScan: boolean = true): Promise<Session[]> {
  const allSessions: Session[] = []
  const gitCache = new Map<string, { gitRepo?: string; gitBranch?: string }>()

  // Collect all file-parser pairs first
  const tasks: Array<{ filePath: string; parse: ParserDef['parse'] }> = []
  for (const parser of PARSERS) {
    const files = await glob(parser.globPattern)
    for (const filePath of files) {
      tasks.push({ filePath, parse: parser.parse })
    }
  }

  // Parse in parallel batches
  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async ({ filePath, parse }) => {
        const cursor = fullScan ? 0 : stateManager.getCursor(filePath)
        try {
          const result = await parse(filePath, cursor)
          stateManager.setCursor(filePath, result.newOffset)
          return result.sessions
        } catch {
          return []
        }
      })
    )
    for (const sessions of results) {
      allSessions.push(...sessions)
    }
  }

  // Git attribution — batch unique cwds
  const cwdsToResolve = new Set<string>()
  for (const s of allSessions) {
    if (s.cwd && !s.gitRepo) cwdsToResolve.add(s.cwd)
  }
  await Promise.all(
    Array.from(cwdsToResolve).map(async cwd => {
      gitCache.set(cwd, await extractGitInfo(cwd))
    })
  )
  for (const s of allSessions) {
    if (s.cwd && !s.gitRepo) {
      const gitInfo = gitCache.get(s.cwd)
      if (gitInfo) {
        s.gitRepo = gitInfo.gitRepo
        if (!s.gitBranch) s.gitBranch = gitInfo.gitBranch
      }
    }
  }

  stateManager.save()
  return allSessions
}
