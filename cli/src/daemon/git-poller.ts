import type Database from 'better-sqlite3'
import { GitEventWorker } from '../git/event-worker.js'
import { correlatePrToSessions } from '../git/pr-correlator.js'
import { correlateCommits } from '../git/commit-correlator.js'
import { BatchRunsRepo } from '../db/repository.js'

const FIVE_MIN_MS = 5 * 60 * 1000

/// Resolve a cwd to an `owner/repo` slug by shelling out to
/// `git -C cwd config --get remote.origin.url`. Memoized across calls so we
/// only pay the process cost once per distinct cwd per daemon run.
const slugCache = new Map<string, string | null>()

async function repoSlugFromCwd(cwd: string): Promise<string | null> {
  if (slugCache.has(cwd)) return slugCache.get(cwd) ?? null
  const { spawn } = await import('node:child_process')
  const url: string | null = await new Promise(resolve => {
    const child = spawn('git', ['-C', cwd, 'config', '--get', 'remote.origin.url'])
    let out = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.on('close', code => {
      if (code !== 0) return resolve(null)
      const trimmed = out.trim()
      resolve(trimmed.length > 0 ? trimmed : null)
    })
    child.on('error', () => resolve(null))
  })
  const slug = url ? extractSlug(url) : null
  slugCache.set(cwd, slug)
  return slug
}

function extractSlug(url: string): string | null {
  const m = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return m ? m[1]! : null
}

/// Backfill `sessions.git_repo` for rows that have a cwd but never got a slug
/// from their parser (Claude Code JSONL doesn't carry the remote). Without
/// this, the downstream repo→cwd lookup turns up empty.
async function backfillGitRepo(db: Database.Database): Promise<void> {
  const cwds = db.prepare(`
    SELECT DISTINCT cwd FROM sessions
    WHERE (git_repo IS NULL OR git_repo = '')
      AND cwd IS NOT NULL AND cwd != ''
  `).all() as Array<{ cwd: string }>
  const update = db.prepare(`
    UPDATE sessions SET git_repo = ?
    WHERE cwd = ? AND (git_repo IS NULL OR git_repo = '')
  `)
  for (const { cwd } of cwds) {
    const slug = await repoSlugFromCwd(cwd)
    if (!slug) continue
    update.run(slug, cwd)
  }
}

function latestCwd(db: Database.Database, repo: string): string | null {
  const row = db.prepare(`
    SELECT cwd FROM sessions
    WHERE git_repo = ? AND cwd IS NOT NULL AND cwd != ''
    ORDER BY started_at DESC LIMIT 1
  `).get(repo) as { cwd?: string } | undefined
  return row?.cwd ?? null
}

/// One pass of the git poll: refresh PRs, correlate them to sessions, then
/// pull commits and attribute each to the session active when it landed.
/// Short-circuits when it has run within the last five minutes so the daemon
/// tick loop can call it on every iteration cheaply.
export async function pollGit(db: Database.Database): Promise<void> {
  const runs = new BatchRunsRepo(db)
  const last = runs.lastRunAt('git_poll') ?? 0
  if (Date.now() - last < FIVE_MIN_MS) return

  try {
    await backfillGitRepo(db)

    const repos = (db.prepare(`
      SELECT DISTINCT git_repo FROM sessions
      WHERE git_repo IS NOT NULL AND git_repo != ''
    `).all() as Array<{ git_repo: string }>).map(r => r.git_repo)

    const worker = new GitEventWorker(db)
    for (const repo of repos) {
      await worker.pollRepo(repo)
      const prNumbers = (db.prepare(`
        SELECT DISTINCT pr_number FROM git_events
        WHERE repo = ? AND kind = 'pr_merged' AND pr_number IS NOT NULL
      `).all(repo) as Array<{ pr_number: number }>).map(r => r.pr_number)
      for (const pr of prNumbers) correlatePrToSessions(db, repo, pr)

      const cwd = latestCwd(db, repo)
      if (cwd) {
        const commits = await worker.pollCommits(repo, cwd)
        correlateCommits(db, repo, commits)
      }
    }
    runs.mark('git_poll', 'ok')
  } catch {
    runs.mark('git_poll', 'error')
  }
}
