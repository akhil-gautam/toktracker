import type Database from 'better-sqlite3'
import { spawn } from 'node:child_process'
import { GitEventsRepo } from '../db/repository.js'

export interface GhPr {
  number: number
  mergedAt: string | null
  headRefName?: string
  mergeCommit?: { oid?: string }
  title?: string
}

export interface GitCommitEntry {
  sha: string
  authoredAt: string
  branch?: string
  subject?: string
}

export interface GitEventWorkerDeps {
  ghRun?: (repo: string) => Promise<GhPr[]>
  gitLogRun?: (repo: string, cwd: string) => Promise<GitCommitEntry[]>
}

async function defaultGhRun(repo: string): Promise<GhPr[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', [
      'pr', 'list', '--repo', repo, '--state', 'merged',
      '--json', 'number,mergedAt,headRefName,mergeCommit,title',
      '--limit', '100',
    ])
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`gh exited ${code}: ${err}`))
      try { resolve(JSON.parse(out)) } catch (e) { reject(e as Error) }
    })
  })
}

async function defaultGitLogRun(_repo: string, cwd: string): Promise<GitCommitEntry[]> {
  return new Promise((resolve, reject) => {
    // %x1f is an ASCII unit-separator — stable across commit subjects that
    // contain "|" or pipes. Parse with split(US) instead.
    const SEP = '\x1f'
    const child = spawn('git', [
      '-C', cwd, 'log',
      `--pretty=format:%H${SEP}%aI${SEP}%s${SEP}%D`,
      '-n', '500',
    ])
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err))
      resolve(out.split('\n').filter(Boolean).map(line => {
        const [sha, authoredAt, subject, refs] = line.split(SEP)
        return { sha, authoredAt, subject, branch: extractBranch(refs ?? '') }
      }))
    })
  })
}

function extractBranch(refs: string): string | undefined {
  for (const raw of refs.split(',')) {
    const t = raw.trim()
    if (t.startsWith('HEAD -> ')) return t.slice(8)
  }
  return undefined
}

export class GitEventWorker {
  private repo: GitEventsRepo
  private ghRun: (repo: string) => Promise<GhPr[]>
  private deps: GitEventWorkerDeps

  constructor(db: Database.Database, deps: GitEventWorkerDeps = {}) {
    this.repo = new GitEventsRepo(db)
    this.ghRun = deps.ghRun ?? defaultGhRun
    this.deps = deps
  }

  async pollRepo(repo: string): Promise<void> {
    let prs: GhPr[]
    try { prs = await this.ghRun(repo) } catch { return }
    for (const p of prs) {
      if (!p.mergedAt) continue
      this.repo.upsert({
        repo, kind: 'pr_merged', prNumber: p.number,
        branch: p.headRefName ?? null,
        sha: p.mergeCommit?.oid ?? null,
        title: p.title ?? null,
        createdAt: Date.parse(p.mergedAt),
      })
    }
  }

  /// Returns the parsed commit entries so the caller can correlate them to
  /// sessions; they're also persisted in `git_events` for historical queries.
  async pollCommits(repo: string, cwd: string): Promise<GitCommitEntry[]> {
    let commits: GitCommitEntry[]
    try { commits = await (this.deps.gitLogRun ?? defaultGitLogRun)(repo, cwd) } catch { return [] }
    for (const c of commits) {
      this.repo.upsert({
        repo, kind: 'commit', sha: c.sha, branch: c.branch ?? null,
        subject: c.subject ?? null,
        committedAt: Date.parse(c.authoredAt) || null,
        prNumber: null, createdAt: Date.parse(c.authoredAt),
      })
    }
    return commits
  }
}
