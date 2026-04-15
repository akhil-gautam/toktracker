import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs'
import { pidFilePath } from '../db/paths.js'

export function writePid(): void {
  writeFileSync(pidFilePath(), String(process.pid))
}
export function readPid(): number | null {
  if (!existsSync(pidFilePath())) return null
  const n = parseInt(readFileSync(pidFilePath(), 'utf8'), 10)
  return Number.isFinite(n) ? n : null
}
export function clearPid(): void {
  if (existsSync(pidFilePath())) unlinkSync(pidFilePath())
}
export function isRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}
