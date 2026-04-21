import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface SlashCommandResult { absolutePath: string; relativePath: string }

/// Scaffold `~/.claude/commands/<slug>.md` from a recurring prompt prefix so
/// the user can invoke `/slug` instead of retyping the phrase. Global scope
/// matches the Swift app's behavior — prompts aren't repo-specific.
export function scaffoldSlashCommand(phrase: string): SlashCommandResult {
  const trimmed = phrase.trim()
  if (trimmed.length === 0) throw new Error('Prompt pattern was empty')
  const slug = slugify(trimmed)
  const dir = join(homedir(), '.claude', 'commands')
  mkdirSync(dir, { recursive: true })
  const absolutePath = join(dir, `${slug}.md`)
  const body = `---
description: Tokscale scaffold — recurring prompt pattern captured from your session history.
---

${trimmed}

<!--
Edit this file to flesh out the command. Tokscale only seeded it with the
detected prefix; fill in the rest of your workflow here.
-->
`
  writeFileSync(absolutePath, body, 'utf8')
  return { absolutePath, relativePath: `~/.claude/commands/${slug}.md` }
}

function slugify(s: string): string {
  const lowered = s.toLowerCase()
  let out = ''
  let lastWasSep = false
  for (const ch of lowered) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch
      lastWasSep = false
    } else if (!lastWasSep && out.length > 0) {
      out += '-'
      lastWasSep = true
    }
  }
  while (out.endsWith('-')) out = out.slice(0, -1)
  if (out.length === 0) return 'tokscale-command'
  return out.slice(0, 40)
}
