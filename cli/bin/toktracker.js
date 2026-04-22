#!/usr/bin/env node
import { argv } from 'node:process'

const hasSubcommand = argv.length > 2 && !argv[2].startsWith('-')

if (hasSubcommand) {
  await import('../dist/cli.js')
} else {
  await import('../dist/index.js')
}
