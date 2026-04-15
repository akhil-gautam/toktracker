import { appendFileSync, existsSync, renameSync, statSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export class HookLogger {
  constructor(private path: string, private maxBytes: number = 10 * 1024 * 1024) {
    mkdirSync(dirname(path), { recursive: true })
  }
  write(message: string): void {
    try {
      if (existsSync(this.path) && statSync(this.path).size >= this.maxBytes) {
        renameSync(this.path, this.path + '.1')
      }
    } catch {}
    try {
      appendFileSync(this.path, `${new Date().toISOString()} ${message}\n`)
    } catch {}
  }
}
