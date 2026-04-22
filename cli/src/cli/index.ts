#!/usr/bin/env node
import { Command } from 'commander'
import { registerHookCommands } from './hook-commands.js'
import { registerDaemonCommands } from './daemon-commands.js'
import { registerRedactCommands } from './redact-commands.js'
import { registerRulesCommands } from './rules-commands.js'
import { registerExportCommands } from './export-commands.js'
import { registerPrivacyCommands } from './privacy-commands.js'

const program = new Command()
program.name('toktracker').description('AI coding tool tracker').version('0.2.2')
registerHookCommands(program)
registerDaemonCommands(program)
registerRedactCommands(program)
registerRulesCommands(program)
registerExportCommands(program)
registerPrivacyCommands(program)
program.parseAsync(process.argv).catch(err => {
  process.stderr.write(`error: ${err.message}\n`)
  process.exit(1)
})
