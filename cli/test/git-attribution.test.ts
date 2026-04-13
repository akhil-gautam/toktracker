import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { extractGitInfo } from '../src/services/git-attribution.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

describe('extractGitInfo', () => {
  let tempDir: string
  beforeEach(() => { tempDir = mkdtempSync(path.join(tmpdir(), 'git-test-')) })
  afterEach(() => { rmSync(tempDir, { recursive: true, force: true }) })

  it('extracts repo and branch from a git directory', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n')
    writeFileSync(path.join(gitDir, 'config'), '[remote "origin"]\n\turl = git@github.com:user/my-repo.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n')
    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBe('user/my-repo')
    expect(info.gitBranch).toBe('main')
  })

  it('handles HTTPS remote URLs', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/feature/auth\n')
    writeFileSync(path.join(gitDir, 'config'), '[remote "origin"]\n\turl = https://github.com/org/project.git\n')
    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBe('org/project')
    expect(info.gitBranch).toBe('feature/auth')
  })

  it('handles detached HEAD', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'abc123def456\n')
    writeFileSync(path.join(gitDir, 'config'), '[remote "origin"]\n\turl = git@github.com:user/repo.git\n')
    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBe('user/repo')
    expect(info.gitBranch).toBeUndefined()
  })

  it('returns empty object when no .git directory', async () => {
    const info = await extractGitInfo(tempDir)
    expect(info.gitRepo).toBeUndefined()
    expect(info.gitBranch).toBeUndefined()
  })

  it('walks up parent directories to find .git', async () => {
    const gitDir = path.join(tempDir, '.git')
    mkdirSync(gitDir)
    writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/develop\n')
    writeFileSync(path.join(gitDir, 'config'), '[remote "origin"]\n\turl = git@github.com:team/mono.git\n')
    const subDir = path.join(tempDir, 'packages', 'core')
    mkdirSync(subDir, { recursive: true })
    const info = await extractGitInfo(subDir)
    expect(info.gitRepo).toBe('team/mono')
    expect(info.gitBranch).toBe('develop')
  })
})
