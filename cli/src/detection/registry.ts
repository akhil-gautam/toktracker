import type { Category, Rule, Trigger } from './types.js'

export class RuleRegistry {
  private rules = new Map<string, Rule>()

  register(rule: Rule): void {
    if (this.rules.has(rule.id)) throw new Error(`Duplicate rule id: ${rule.id}`)
    this.rules.set(rule.id, rule)
  }
  all(): Rule[] {
    return [...this.rules.values()]
  }
  byTrigger(trigger: Trigger): Rule[] {
    return this.all().filter(r => r.triggers.includes(trigger))
  }
  byCategory(category: Category): Rule[] {
    return this.all().filter(r => r.category === category)
  }
  get(id: string): Rule | undefined {
    return this.rules.get(id)
  }
}
