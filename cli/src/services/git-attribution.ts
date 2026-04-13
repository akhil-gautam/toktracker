import { readFile, access } from 'fs/promises'
import path from 'path'

interface GitInfo { gitRepo?: string; gitBranch?: string }

async function findGitDir(cwd: string): Promise<string | null> {
  let dir = cwd
  const root = path.parse(dir).root
  while (dir !== root) {
    const gitPath = path.join(dir, '.git')
    try { await access(gitPath); return gitPath } catch { dir = path.dirname(dir) }
  }
  return null
}

function extractRepoFromUrl(url: string): string | undefined {
  const match = url.match(/[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
  return match?.[1]
}

export async function extractGitInfo(cwd: string): Promise<GitInfo> {
  try {
    const gitDir = await findGitDir(cwd)
    if (!gitDir) return {}
    const [headContent, configContent] = await Promise.all([
      readFile(path.join(gitDir, 'HEAD'), 'utf-8').catch(() => ''),
      readFile(path.join(gitDir, 'config'), 'utf-8').catch(() => ''),
    ])
    let gitBranch: string | undefined
    const branchMatch = headContent.match(/^ref: refs\/heads\/(.+)/)
    if (branchMatch) gitBranch = branchMatch[1].trim()
    const urlMatch = configContent.match(/\[remote "origin"\][^[]*url\s*=\s*(.+)/m)
    const gitRepo = urlMatch ? extractRepoFromUrl(urlMatch[1].trim()) : undefined
    return { gitRepo, gitBranch }
  } catch { return {} }
}
