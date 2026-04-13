import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import type { Budget, CursorState } from '../types.js'

export class StateManager {
  private configDir: string
  private cursors: Record<string, number> = {}

  constructor(configDir?: string) {
    this.configDir = configDir ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? '~', '.config', 'tokscale')
    if (!existsSync(this.configDir)) mkdirSync(this.configDir, { recursive: true })
    this.loadState()
  }

  private statePath() { return path.join(this.configDir, 'state.json') }
  private budgetsPath() { return path.join(this.configDir, 'budgets.json') }
  private authPath() { return path.join(this.configDir, 'auth.json') }

  private loadState() {
    try { const state: CursorState = JSON.parse(readFileSync(this.statePath(), 'utf-8')); this.cursors = state.cursors ?? {} }
    catch { this.cursors = {} }
  }

  getCursor(filePath: string): number { return this.cursors[filePath] ?? 0 }
  setCursor(filePath: string, offset: number) { this.cursors[filePath] = offset }
  save() { writeFileSync(this.statePath(), JSON.stringify({ cursors: this.cursors } as CursorState, null, 2)) }

  loadBudgets(): Budget[] {
    try { return JSON.parse(readFileSync(this.budgetsPath(), 'utf-8')) } catch { return [] }
  }
  saveBudgets(budgets: Budget[]) { writeFileSync(this.budgetsPath(), JSON.stringify(budgets, null, 2)) }
  isServerMode(): boolean { return existsSync(this.authPath()) }
}
