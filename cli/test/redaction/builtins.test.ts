import { describe, it, expect } from 'vitest'
import { BUILTIN_REDACTION_RULES } from '../../src/redaction/builtins.js'
import { Redactor } from '../../src/redaction/pipeline.js'

const r = new Redactor(BUILTIN_REDACTION_RULES.map((b, i) => ({ ...b, id: i + 1 })))

describe('builtin redaction rules', () => {
  it.each([
    ['AWS access key', 'AKIAIOSFODNN7EXAMPLE here', /\[REDACTED_AWS_AK\]/],
    ['GitHub token',   'ghp_abcdefghijklmnopqrstuvwxyz0123456789', /\[REDACTED_GH_TOKEN\]/],
    ['OpenAI key',     'sk-abcdefghijklmnopqrstuvwxyz', /\[REDACTED_API_KEY\]/],
    ['private key',    '-----BEGIN OPENSSH PRIVATE KEY-----\nbody\n-----END OPENSSH PRIVATE KEY-----', /\[REDACTED_PRIVATE_KEY\]/],
    ['email',          'akhil@example.com', /\[REDACTED_EMAIL\]/],
  ])('redacts %s', (_name, input, match) => {
    expect(r.apply(input)).toMatch(match)
  })
})
