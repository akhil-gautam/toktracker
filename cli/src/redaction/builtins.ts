export interface RedactionRuleDef {
  pattern: string
  replacement: string
  enabled: number
  builtin: number
}

export const BUILTIN_REDACTION_RULES: RedactionRuleDef[] = [
  { pattern: 'AKIA[0-9A-Z]{16}', replacement: '[REDACTED_AWS_AK]', enabled: 1, builtin: 1 },
  { pattern: 'ghp_[A-Za-z0-9]{20,}', replacement: '[REDACTED_GH_TOKEN]', enabled: 1, builtin: 1 },
  { pattern: 'github_pat_[A-Za-z0-9_]{20,}', replacement: '[REDACTED_GH_TOKEN]', enabled: 1, builtin: 1 },
  { pattern: 'sk-[A-Za-z0-9_-]{20,}', replacement: '[REDACTED_API_KEY]', enabled: 1, builtin: 1 },
  { pattern: 'xox[baprs]-[A-Za-z0-9-]{10,}', replacement: '[REDACTED_SLACK]', enabled: 1, builtin: 1 },
  { pattern: '-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----', replacement: '[REDACTED_PRIVATE_KEY]', enabled: 1, builtin: 1 },
  { pattern: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}', replacement: '[REDACTED_EMAIL]', enabled: 1, builtin: 1 },
  { pattern: '\\b\\+?\\d{1,2}[\\s.-]?\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}\\b', replacement: '[REDACTED_PHONE]', enabled: 1, builtin: 1 },
]
