import type { CategoryRuleCandidate } from './types';

function normalizeRuleText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const MATCH_PRIORITY: Record<CategoryRuleCandidate['match_type'], number> = {
  exact: 3,
  starts_with: 2,
  contains: 1,
};

function matchesTarget(target: string, rule: CategoryRuleCandidate): boolean {
  const normPattern = normalizeRuleText(rule.pattern);
  if (!normPattern || !target) return false;

  if (rule.match_type === 'exact') return target === normPattern;
  if (rule.match_type === 'starts_with') return target.startsWith(normPattern);
  return target.includes(normPattern);
}

export function suggestCategoryFromRules(
  rules: CategoryRuleCandidate[],
  input: { merchantName?: string | null; cnpj?: string | null }
): string | null {
  const targets: string[] = [];
  if (input.cnpj) {
    const cnpjDigits = input.cnpj.replace(/\D/g, '');
    if (cnpjDigits) targets.push(cnpjDigits);
  }
  if (input.merchantName) {
    const normName = normalizeRuleText(input.merchantName);
    if (normName) targets.push(normName);
  }
  if (targets.length === 0 || rules.length === 0) return null;

  let bestRule: CategoryRuleCandidate | null = null;
  for (const rule of rules) {
    const matched = targets.some((t) => matchesTarget(t, rule));
    if (!matched) continue;
    if (!bestRule) {
      bestRule = rule;
      continue;
    }
    const curRank = MATCH_PRIORITY[rule.match_type];
    const bestRank = MATCH_PRIORITY[bestRule.match_type];
    if (curRank > bestRank || (curRank === bestRank && rule.pattern.length > bestRule.pattern.length)) {
      bestRule = rule;
    }
  }

  return bestRule?.category_id ?? null;
}
