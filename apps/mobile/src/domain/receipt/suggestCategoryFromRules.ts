import type { CategoryRuleCandidate } from './types';

export function suggestCategoryFromRules(
  rules: CategoryRuleCandidate[],
  input: { merchantName?: string | null; cnpj?: string | null }
): string | null {
  throw new Error('Not implemented');
}
