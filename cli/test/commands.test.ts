import { describe, it, expect } from 'vitest'
import { filterSlashCommands, SLASH_COMMANDS } from '../src/commands.js'

describe('filterSlashCommands', () => {
  it('returns everything for an empty query', () => {
    expect(filterSlashCommands('')).toEqual(SLASH_COMMANDS)
  })

  it('filters by prefix', () => {
    const names = filterSlashCommands('budget').map(c => c.name)
    expect(names).toContain('budget set')
    expect(names).toContain('budget clear')
    expect(filterSlashCommands('budget').every(c => c.name.includes('budget'))).toBe(true)
  })

  it('keeps the command matched while typing its arguments', () => {
    const names = filterSlashCommands('budget set 50 weekly').map(c => c.name)
    expect(names).toContain('budget set')
  })

  it('matches tab-jump commands', () => {
    expect(filterSlashCommands('mod').map(c => c.name)).toContain('models')
    expect(filterSlashCommands('att').map(c => c.name)).toContain('attribution')
  })
})
