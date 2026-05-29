import type { Command } from 'commander'
import { createServer, type ServerResponse } from 'node:http'
import { SessionStore } from '../services/session-store.js'
import { StateManager } from '../services/state-manager.js'
import { loadAllSessions } from '../parsers/index.js'
import { checkBudgets } from '../hooks/useBudget.js'
import { projectBudget } from '../services/pace.js'

const ENDPOINTS = ['/health', '/stats', '/models', '/repos', '/daily?days=30', '/sessions?limit=100', '/budgets']

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body, null, 2)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(json)
}

export function registerServeCommands(program: Command): void {
  program.command('serve')
    .description('Serve your usage data as JSON on 127.0.0.1 (opt-in, loopback only) for dashboards/CI')
    .option('--port <n>', 'port to listen on', '4317')
    .action(async (opts) => {
      const port = parseInt(opts.port, 10) || 4317
      const store = new SessionStore()
      const sm = new StateManager()

      const reload = async () => {
        store.addSessions(await loadAllSessions(sm))
      }
      await reload()

      const budgetsJSON = () => {
        const budgets = sm.loadBudgets()
        return checkBudgets(budgets, store.getAllSessions()).map(r => ({
          ...r, pace: projectBudget(r),
        }))
      }

      const server = createServer(async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          if (url.searchParams.get('fresh') === '1') await reload()
          const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') ?? '30', 10) || 30))
          const limit = Math.max(1, Math.min(5000, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100))

          switch (url.pathname) {
            case '/':
              return send(res, 200, { service: 'toktracker', endpoints: ENDPOINTS, note: 'loopback-only; append ?fresh=1 to re-scan logs' })
            case '/health':
              return send(res, 200, { ok: true })
            case '/stats':
              return send(res, 200, {
                allTime: store.getAllTimeStats(),
                today: store.getTodayDetail(),
                weekTotal: store.getWeekTotal(),
              })
            case '/models':
              return send(res, 200, store.getModelStats())
            case '/repos':
              return send(res, 200, store.getRepoStats())
            case '/daily':
              return send(res, 200, store.getDailyStats(days))
            case '/sessions':
              return send(res, 200, store.getRecentSessions(limit).map(s => ({
                ...s, startedAt: s.startedAt.toISOString(), endedAt: s.endedAt?.toISOString(),
              })))
            case '/budgets':
              return send(res, 200, budgetsJSON())
            default:
              return send(res, 404, { error: 'not found', endpoints: ENDPOINTS })
          }
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
        }
      })

      // Bind to loopback ONLY — never exposed beyond the local machine.
      server.listen(port, '127.0.0.1', () => {
        process.stdout.write(`toktracker serving on http://127.0.0.1:${port} (loopback only)\n`)
        process.stdout.write(`endpoints: ${ENDPOINTS.join('  ')}\n`)
      })
    })
}
