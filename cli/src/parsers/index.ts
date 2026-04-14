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

/**
 * Load all sessions from all parsers.
 * fullScan=true (default): parse from beginning of every file — shows all-time data.
 * fullScan=false: parse only new data since last cursor — for incremental watch mode.
 */
export async function loadAllSessions(stateManager: StateManager, fullScan: boolean = true): Promise<Session[]> {
  const allSessions: Session[] = []
  const gitCache = new Map<string, { gitRepo?: string; gitBranch?: string }>()

  for (const parser of PARSERS) {
    const files = await glob(parser.globPattern)
    for (const filePath of files) {
      const cursor = fullScan ? 0 : stateManager.getCursor(filePath)
      try {
        const result = await parser.parse(filePath, cursor)
        stateManager.setCursor(filePath, result.newOffset)
        for (const session of result.sessions) {
          if (session.cwd && !session.gitRepo) {
            if (!gitCache.has(session.cwd)) {
              gitCache.set(session.cwd, await extractGitInfo(session.cwd))
            }
            const gitInfo = gitCache.get(session.cwd)!
            session.gitRepo = gitInfo.gitRepo
            if (!session.gitBranch) session.gitBranch = gitInfo.gitBranch
          }
        }
        allSessions.push(...result.sessions)
      } catch { continue }
    }
  }
  stateManager.save()
  return allSessions
}
