# Proactive Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend toktracker from retrospective spend dashboard to proactive coding-agent intelligence layer — 14 novel detection rules across categories A (proactive waste), B (pattern mining), C (predictive guardrails), D (ROI attribution), delivered via TUI tabs plus Claude Code hook injection and a polling daemon for non-hook tools.

**Architecture:** Five subsystems sharing a SQLite store at `~/.config/tokscale/toktracker.db`: TUI (existing Ink app, new tabs), short-lived Hook exec process, long-running Daemon watcher, pure-function Detection engine, Redaction pipeline. Per-message + per-tool-call data captured going forward plus one-time backfill of history. Hook exec returns decision (allow/warn/block) to Claude Code within 50ms p95. Codex/OpenCode/Gemini use polling fallback with OS notifications.

**Tech Stack:** Node.js 20+, TypeScript 5.7 strict, Ink 5 (React 18), better-sqlite3 (WAL), chokidar, commander (CLI), node-notifier, onnxruntime-node + @xenova/transformers (local embeddings for B6), vitest.

**Reference spec:** `docs/superpowers/specs/2026-04-15-proactive-insights-design.md`

---

See companion file `2026-04-15-proactive-insights-plan-part-1.md` onwards for detailed tasks. Plan is split across multiple part files to keep each manageable.

## Part index

- Part 1 — Phase 1: Storage foundation (DB schema, migrations, redaction)
- Part 2 — Phase 2: Data capture upgrade (parsers, git events, backfill)
- Part 3 — Phase 3: Detection engine core (registry, runner, context builder)
- Part 4 — Phase 4: Hook infrastructure (install, uninstall, exec, log)
- Part 5 — Phase 5: Category A + C rules (live)
- Part 6 — Phase 6: Category B + D rules (batch, embeddings, PR correlation)
- Part 7 — Phase 7: TUI + daemon + CLI + polish

Each part is a standalone executable plan section. Tasks within a part are ordered; parts themselves must be executed in order because later parts depend on earlier ones per the phase gating in the spec (§11).
