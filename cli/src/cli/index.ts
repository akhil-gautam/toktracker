#!/usr/bin/env node
import { Command } from 'commander'
import { registerHookCommands } from './hook-commands.js'

const program = new Command()
program.name('tokscale').description('AI coding tool tracker').version('0.2.0')
registerHookCommands(program)
program.parseAsync(process.argv).catch(err => {
  process.stderr.write(`error: ${err.message}\n`)
  process.exit(1)
})
