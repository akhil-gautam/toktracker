#!/usr/bin/env node
import { Command } from 'commander'
import packageJson from '../../package.json' with { type: 'json' }
import { registerHookCommands } from './hook-commands.js'
import { registerDaemonCommands } from './daemon-commands.js'
import { registerRedactCommands } from './redact-commands.js'
import { registerRulesCommands } from './rules-commands.js'
import { registerExportCommands } from './export-commands.js'
import { registerPrivacyCommands } from './privacy-commands.js'
import { registerPricingCommands } from './pricing-commands.js'
import { registerServeCommands } from './serve-commands.js'
import { registerStatusCommands } from './status-commands.js'

const program = new Command()
program.name('toktracker').description('AI coding tool tracker').version(packageJson.version)
registerHookCommands(program)
registerDaemonCommands(program)
registerRedactCommands(program)
registerRulesCommands(program)
registerExportCommands(program)
registerPrivacyCommands(program)
registerPricingCommands(program)
registerServeCommands(program)
registerStatusCommands(program)
program.parseAsync(process.argv).catch(err => {
  process.stderr.write(`error: ${err.message}\n`)
  process.exit(1)
})
