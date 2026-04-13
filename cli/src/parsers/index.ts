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

export async function loadAllSessions(stateManager: StateManager): Promise<Session[]> {
  const allSessions: Session[] = []
  for (const parser of PARSERS) {
    const files = await glob(parser.globPattern)
    for (const filePath of files) {
      const cursor = stateManager.getCursor(filePath)
      try {
        const result = await parser.parse(filePath, cursor)
        stateManager.setCursor(filePath, result.newOffset)
        for (const session of result.sessions) {
          if (session.cwd && !session.gitRepo) {
            const gitInfo = await extractGitInfo(session.cwd)
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
