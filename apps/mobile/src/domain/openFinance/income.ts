import type { PluggyTransaction } from '../../services/pluggy/types';

export interface BankIncomeCandidate {
  ticker: string;
  payDate: string;
  amount: string;
  kind: 'DIVIDENDO' | 'JCP' | 'RENDIMENTO';
  externalId: string;
  notes: string | null;
  source: 'OPEN_FINANCE_BANK';
}

export function detectBankIncomeCandidate(
  _tx: Pick<PluggyTransaction, 'id' | 'type' | 'amount' | 'date' | 'description' | 'category' | 'categoryId'>,
  _knownTickers: Set<string> | string[]
): BankIncomeCandidate | null {
  return null;
}
