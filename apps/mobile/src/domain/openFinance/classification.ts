// STUB (Sprint 91, Fase A): assinaturas apenas para compilar. A implementação vem na Fase B.
import type { PluggyTransaction } from '../../services/pluggy/types';
import type { CategoryRuleLike } from '../statementImport';

export type OpenFinanceClassReason =
  | 'INCOME_LINKED'
  | 'INVESTMENT_MOVE'
  | 'OWN_ACCOUNT_UNPAIRED'
  | 'CARD_BILL_PAYMENT'
  | 'SIGN';

export interface ClassifyContext {
  rules?: CategoryRuleLike[];
  isIncomeLinked?: boolean;
}

export interface ClassifyResult {
  kind: 'income' | 'expense' | 'transfer_in' | 'transfer_out';
  categoryId: string;
  matchedRuleId?: string;
  reason: OpenFinanceClassReason;
}

export function classifyOpenFinanceBankEntry(tx: PluggyTransaction, _ctx: ClassifyContext = {}): ClassifyResult {
  const kind = tx.type === 'DEBIT' || tx.amount < 0 ? 'expense' : 'income';
  return { kind, categoryId: 'cat-outros-despesa', reason: 'SIGN' };
}

export function resolveCategoryByPluggyId(_input: {
  category?: string | null;
  categoryId?: string | null;
  kind: 'income' | 'expense';
  rules: CategoryRuleLike[];
  description: string;
}): { categoryId: string; matchedRuleId?: string } {
  return { categoryId: 'cat-outros-despesa' };
}

export interface OwnTransferCandidate {
  id: string;
  external_id: string | null;
  account_id: string;
  account_type: string;
  kind: string;
  amount_cents: number;
  due_date: string;
  status: string;
  category_id: string;
  description: string;
  transfer_group_id: string | null;
  of_category_id: string | null;
  of_class_reason: string | null;
  user_edited_fields: string | null;
  source: string;
  of_removed_at: string | null;
}

export interface OwnTransferPair {
  outId: string;
  inId: string;
  transferGroupId: string;
}

export function findOwnTransferPairs(_candidates: OwnTransferCandidate[], _todayIso: string): OwnTransferPair[] {
  return [];
}

export function findCardTopupPairs(_candidates: OwnTransferCandidate[]): OwnTransferPair[] {
  return [];
}

export function isStaleOpenFinancePending(
  _entry: { status: string; due_date: string; source: string; of_removed_at?: string | null },
  _todayIso: string
): boolean {
  return false;
}
