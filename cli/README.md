# Tokscale — proactive insights for AI coding assistants

Tokscale hooks into Claude Code, Codex, OpenCode, and Gemini CLI to watch
your token spend in real time and warn you before waste compounds. No existing
tool proactively surfaces AI-agent anti-patterns while they are happening;
Tokscale does.

## Install

```
npm install -g tokscale
```

Requires Node 20+.

## Quick start

```
# Open the TUI dashboard
tokscale

# Enable hook injection for Claude Code (writes to settings.json)
tokscale hook install --global

# Start background watcher for Codex / OpenCode / Gemini
tokscale daemon start --detach
```

## What it does

Tokscale runs 14 detection rules grouped into four families:

- **Redundant tool calls** — repeated reads of the same file, duplicate Bash
  commands, unnecessary directory listings within a single session.
- **Context bloat** — large file re-opens, prompt templates that inflate token
  count, context-window ETA warnings before you hit the limit.
- **Waste postmortems** — cache-miss analysis, retry and failure spend, model
  mismatch (using Opus where Haiku suffices), runaway kill-switch detection.
- **Session-level signals** — repeat questions across sessions, correction
  patterns (you frequently fix AI output), cost per merged PR, abandoned
  session detection, pre-flight cost estimation.

Rules emit inline hints inside Claude Code via the hook mechanism. The TUI
aggregates everything into a single dashboard.

## TUI cheat sheet

```
1-0       Switch tabs (Sessions, Today, Models, Repos, Hooks, Rules,
          Insights, Redact, Privacy, Help)
?         Full keybinding overlay
q         Quit
```

## CLI cheat sheet

```
# Hooks
tokscale hook install [--global|--local]
tokscale hook status  [--global|--local]
tokscale hook uninstall [--global|--local]

# Rules
tokscale rules list
tokscale rules enable  <rule-id>
tokscale rules disable <rule-id>
tokscale rules set-threshold <rule-id> <value>
tokscale rules hard-block <rule-id> [on|off]

# Redaction
tokscale redact list
tokscale redact add <pattern>
tokscale redact test <string>

# Daemon
tokscale daemon start [--detach]
tokscale daemon stop
tokscale daemon status

# Privacy
tokscale privacy audit
tokscale privacy wipe

# Export
tokscale export
```

## Privacy

All data is stored locally in `~/.config/tokscale/toktracker.db`. Nothing
leaves your machine unless you explicitly export it. The redaction pipeline
strips secrets and PII from payloads before they reach the database. Run
`tokscale privacy audit` to inspect what is stored, and `tokscale privacy wipe`
to delete everything.

## Requirements

- Node 20+
- macOS or Linux (Windows is untested)

## License

MIT
