import type Database from 'better-sqlite3'
import { spawn } from 'node:child_process'
import { GitEventsRepo } from '../db/repository.js'

export interface GhPr {
  number: number
  mergedAt: string | null
  headRefName?: string
  mergeCommit?: { oid?: string }
}

export interface GitCommitEntry {
  sha: string
  authoredAt: string
  branch?: string
}

export interface GitEventWorkerDeps {
  ghRun?: (repo: string) => Promise<GhPr[]>
  gitLogRun?: (repo: string, cwd: string) => Promise<GitCommitEntry[]>
}

async function defaultGhRun(repo: string): Promise<GhPr[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', ['pr', 'list', '--repo', repo, '--state', 'merged', '--json', 'number,mergedAt,headRefName,mergeCommit', '--limit', '100'])
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
    const child = spawn('git', ['-C', cwd, 'log', '--pretty=format:%H|%aI', '-n', '500'])
    let out = ''
    let err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('close', code => {
      if (code !== 0) return reject(new Error(err))
      resolve(out.split('\n').filter(Boolean).map(l => {
        const [sha, authoredAt] = l.split('|')
        return { sha, authoredAt }
      }))
    })
  })
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
        createdAt: Date.parse(p.mergedAt),
      })
    }
  }

  async pollCommits(repo: string, cwd: string): Promise<void> {
    let commits: GitCommitEntry[]
    try { commits = await (this.deps.gitLogRun ?? defaultGitLogRun)(repo, cwd) } catch { return }
    for (const c of commits) {
      this.repo.upsert({
        repo, kind: 'commit', sha: c.sha, branch: c.branch ?? null,
        prNumber: null, createdAt: Date.parse(c.authoredAt),
      })
    }
  }
}
