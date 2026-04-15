import type { Command } from 'commander'
import { bootDb } from '../db/boot.js'
import { RedactionRulesRepo } from '../redaction/repository.js'
import { Redactor } from '../redaction/pipeline.js'
import { readFileSync } from 'node:fs'

export function registerRedactCommands(program: Command): void {
  const redact = program.command('redact').description('Manage redaction rules')
  redact.command('list').action(() => {
    const rows = new RedactionRulesRepo(bootDb()).all()
    for (const r of rows) process.stdout.write(`${r.id}\t${r.enabled ? 'on' : 'off'}\t${r.builtin ? 'builtin' : 'user'}\t${r.pattern} → ${r.replacement}\n`)
  })
  redact.command('add <pattern>').option('--replacement <s>', '', '[REDACTED]').action((pattern, opts) => {
    const r = new RedactionRulesRepo(bootDb()).add(pattern, opts.replacement)
    process.stdout.write(`added id=${r.id}\n`)
  })
  redact.command('remove <id>').action((id) => {
    new RedactionRulesRepo(bootDb()).remove(parseInt(id, 10))
  })
  redact.command('test <file>').action((file) => {
    const redactor = new Redactor(new RedactionRulesRepo(bootDb()).all())
    process.stdout.write(redactor.apply(readFileSync(file, 'utf8')))
  })
}
