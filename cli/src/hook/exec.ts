import type Database from 'better-sqlite3'
import { HookEventsRepo } from '../db/repository.js'
import { RuleRegistry } from '../detection/registry.js'
import { ThresholdLoader } from '../detection/thresholds.js'
import { DetectionRunner } from '../detection/runner.js'
import { buildHookContext, type HookPayload } from '../detection/context-builder.js'
import { HookLogger } from './log.js'
import type { HookDecision } from '../detection/types.js'

export interface HookExecArgs {
  kind: string
  payload: HookPayload
  db: Database.Database
  registry: RuleRegistry
  logPath: string
  budgetMs?: number
}

const VALID_KINDS = new Set(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'])

export async function runHookExec(args: HookExecArgs): Promise<HookDecision> {
  const logger = new HookLogger(args.logPath)
  if (!VALID_KINDS.has(args.kind)) { logger.write(`unknown kind=${args.kind}`); return {} }
  const start = Date.now()
  const ctx = buildHookContext(args.db, { ...args.payload, hook_event_name: args.kind })
  const runner = new DetectionRunner(args.db, args.registry, new ThresholdLoader(args.db), { budgetMs: args.budgetMs ?? 200 })

  let decision: HookDecision = {}
  try {
    const result = await runner.run(ctx)
    decision = result.decision
    new HookEventsRepo(args.db).insert({
      sessionId: ctx.sessionId ?? null,
      hookKind: args.kind,
      payloadJson: JSON.stringify(args.payload),
      decision: decision.decision ?? null,
      reason: decision.reason ?? null,
      latencyMs: result.latencyMs,
      createdAt: Date.now(),
    })
  } catch (err) {
    logger.write(`error: ${(err as Error).message}`)
    new HookEventsRepo(args.db).insert({
      sessionId: ctx.sessionId ?? null,
      hookKind: args.kind,
      payloadJson: JSON.stringify(args.payload),
      decision: null, reason: null, latencyMs: Date.now() - start,
      createdAt: Date.now(),
    })
  }
  return decision
}

export async function readStdinJson(): Promise<HookPayload> {
  return new Promise((resolve, reject) => {
    let buf = ''
    process.stdin.on('data', d => { buf += d.toString() })
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')) } catch (e) { reject(e as Error) }
    })
    process.stdin.on('error', e => reject(e))
  })
}

export function emit(response: HookDecision): void {
  process.stdout.write(JSON.stringify(response))
}
