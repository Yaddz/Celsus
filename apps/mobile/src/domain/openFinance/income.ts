import Decimal from 'decimal.js';
import type { PluggyTransaction } from '../../services/pluggy/types';
import { normalizeInvestmentTicker } from './investments';

export interface KnownIncomeAsset {
  ticker: string;
  name?: string | null;
  status?: string | null;
}

export interface DetectBankIncomeOptions {
  onAmbiguous?: () => void;
}

export interface BankIncomeCandidate {
  ticker: string;
  payDate: string;
  amount: string;
  kind: 'DIVIDENDO' | 'JCP' | 'RENDIMENTO';
  externalId: string;
  notes: string | null;
  source: 'OPEN_FINANCE_BANK';
  quantity?: string | null;
  unitAmount?: string | null;
}

const INCOME_DESC_RE = /\b(DIVIDENDOS?|JCP|JUROS\s+S(?:OBRE|\/)\s*CAPITAL|RENDIMENTOS?)\b/i;

function isPluggyInvestmentIncomeCategory(
  category: string | null | undefined,
  categoryId: string | null | undefined
): boolean {
  const cat = (category || '').trim().toLowerCase();
  const catId = (categoryId || '').trim();
  if (catId.startsWith('0407')) return true;
  if (
    cat.includes('proceeds interests and dividends') ||
    cat.includes('dividend') ||
    cat.includes('rendimento')
  ) {
    return true;
  }
  return false;
}

/**
 * R9: Detecta créditos em conta corrente/corretora que representam proventos
 * de ativos conhecidos (dividendos, JCP ou rendimentos).
 */
export function detectBankIncomeCandidate(
  tx: Pick<PluggyTransaction, 'id' | 'type' | 'amount' | 'date' | 'description' | 'category' | 'categoryId'>,
  knownTickers: Set<string> | string[] | KnownIncomeAsset[],
  _options?: DetectBankIncomeOptions
): BankIncomeCandidate | null {
  if (tx.type !== 'CREDIT' || !tx.amount || tx.amount <= 0) {
    return null;
  }

  const desc = (tx.description || '').trim();
  const matchesCategory = isPluggyInvestmentIncomeCategory(tx.category, tx.categoryId);
  const matchesDescription = INCOME_DESC_RE.test(desc);

  if (!matchesCategory && !matchesDescription) {
    return null;
  }

  const knownSet = new Set<string>();
  for (const t of knownTickers) {
    const ticker = typeof t === 'string' ? t : t.ticker;
    const norm = normalizeInvestmentTicker(ticker);
    if (norm) knownSet.add(norm);
  }
  if (knownSet.size === 0) {
    return null;
  }

  const tokens = desc
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let matchedTicker: string | null = null;
  for (const tok of tokens) {
    const normTok = normalizeInvestmentTicker(tok);
    if (knownSet.has(normTok)) {
      matchedTicker = normTok;
      break;
    }
  }

  if (!matchedTicker) {
    return null;
  }

  const normDesc = desc
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let kind: 'DIVIDENDO' | 'JCP' | 'RENDIMENTO' = 'RENDIMENTO';
  if (normDesc.includes('jcp') || normDesc.includes('juros sobre capital') || normDesc.includes('juros s/ capital')) {
    kind = 'JCP';
  } else if (normDesc.includes('dividend')) {
    kind = 'DIVIDENDO';
  }

  return {
    ticker: matchedTicker,
    payDate: (tx.date || '').slice(0, 10),
    amount: new Decimal(tx.amount).abs().toFixed(2),
    kind,
    externalId: `pluggy-bank:${tx.id}`,
    notes: desc || null,
    source: 'OPEN_FINANCE_BANK',
  };
}
