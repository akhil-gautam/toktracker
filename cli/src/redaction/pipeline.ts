export interface RedactionRule {
  id: number
  pattern: string
  replacement: string
  enabled: number
  builtin: number
}

export class Redactor {
  private compiled: Array<{ re: RegExp; replacement: string }>
  constructor(rules: RedactionRule[]) {
    this.compiled = rules
      .filter(r => r.enabled === 1)
      .map(r => ({ re: new RegExp(r.pattern, 'g'), replacement: r.replacement }))
  }
  apply(text: string): string {
    let out = text
    for (const { re, replacement } of this.compiled) out = out.replace(re, replacement)
    return out
  }
}
