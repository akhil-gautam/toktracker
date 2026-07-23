// Slash-command registry powering the `/` command palette. `name` is what the
// user types after the slash; `hint` (if present) means the command takes args.
export interface SlashCommand {
  name: string
  hint?: string
  desc: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'budget set', hint: '<amount> [daily|weekly|monthly]', desc: 'Set a spend budget' },
  { name: 'budget clear', desc: 'Remove all budgets' },
  { name: 'help', desc: 'Show keyboard shortcuts' },
  { name: 'overview', desc: 'Go to the Overview tab' },
  { name: 'models', desc: 'Go to the Models tab' },
  { name: 'daily', desc: 'Go to the Daily tab' },
  { name: 'repos', desc: 'Go to the Repos tab' },
  { name: 'budget', desc: 'Go to the Budget tab' },
  { name: 'sessions', desc: 'Go to the Sessions tab' },
  { name: 'insights', desc: 'Go to the Insights tab' },
  { name: 'rules', desc: 'Go to the Rules tab' },
  { name: 'attribution', desc: 'Go to the Attribution tab' },
  { name: 'hooks', desc: 'Go to the Hooks tab' },
]

/** Filter the palette by the text typed after the slash. Matches a command when
 *  its name starts-with or contains the query, or the query (incl. args the user
 *  is typing) starts with the command name — so the relevant command stays
 *  highlighted while you type its arguments. */
export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(c => {
    const n = c.name.toLowerCase()
    return n.startsWith(q) || q.startsWith(n) || n.includes(q)
  })
}
