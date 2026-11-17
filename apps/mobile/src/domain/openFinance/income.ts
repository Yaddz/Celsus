import Decimal from 'decimal.js';
import type { PluggyTransaction } from '../../services/pluggy/types';
import { toBrtDate } from './dates';
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

const INCOME_NAME_STOPWORDS = new Set([
  'FII',
  'FUNDO',
  'FUNDOS',
  'INVESTIMENTO',
  'INVESTIMENTOS',
  'IMOBILIARIO',
  'RENDIMENTOS',
  'RENDIMENTO',
  'DIVIDENDOS',
  'DIVIDENDO',
  'JCP',
  'JUROS',
  'A',
  'VISTA',
  'DE',
  'DO',
  'DA',
  'DOS',
  'DAS',
  'CLIENTES',
  'S',
]);

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenizeAlphaNum(str: string): string[] {
  return stripAccents(str)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isSubsequence(needle: string, haystack: string): boolean {
  let ni = 0;
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi += 1) {
    if (haystack[hi] === needle[ni]) {
      ni += 1;
    }
  }
  return ni === needle.length;
}

function matchesQueryWordsInOrder(queryWords: string[], nameWords: string[]): boolean {
  if (queryWords.length === 0 || nameWords.length === 0) return false;
  let nameIdx = 0;
  for (const qw of queryWords) {
    let matched = false;
    for (let j = nameIdx; j < nameWords.length; j += 1) {
      if (nameWords[j].startsWith(qw)) {
        nameIdx = j + 1;
        matched = true;
        break;
      }
    }
    if (!matched && qw.length >= 2) {
      // Cobre abreviação por iniciais consecutivas (ex.: "SC" em "SHOPPING CENTERS")
      for (let j = nameIdx; j + qw.length <= nameWords.length; j += 1) {
        let initialsMatch = true;
        for (let k = 0; k < qw.length; k += 1) {
          if (nameWords[j + k][0] !== qw[k]) {
            initialsMatch = false;
            break;
          }
        }
        if (initialsMatch) {
          nameIdx = j + qw.length;
          matched = true;
          break;
        }
      }
    }
    if (!matched) return false;
  }
  return true;
}

/**
 * Trecho com o nome do fundo: o que vem depois de "s/" ou "FII". Sem esse marcador não há nome a procurar
 * (Sprint 92): usar a descrição inteira fazia "CONTA REMUNERADA - RESGATE REMUNERAÇÃO" casar com CSAN3.
 */
function extractFundQueryWords(desc: string): string[] {
  const sSlashMatch = desc.match(/\bs\/\s*(.+)$/i);
  const fiiMatch = !sSlashMatch ? desc.match(/\bFII\b\s*(.+)$/i) : null;
  const fragment = sSlashMatch ? sSlashMatch[1] : fiiMatch ? fiiMatch[1] : null;
  if (!fragment) return [];
  return tokenizeAlphaNum(fragment).filter((w) => !INCOME_NAME_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

function isPluggyInvestmentIncomeCategory(
  category: string | null | undefined,
  categoryId: string | null | undefined
): boolean {
  const cat = (category || '').trim().toLowerCase();
  const catId = (categoryId || '').trim();
  if (catId.startsWith('0407') || catId.startsWith('0306')) return true;
  if (
    cat.includes('proceeds interests and dividends') ||
    cat.includes('dividend') ||
    cat.includes('rendimento')
  ) {
    return true;
  }
  return false;
}

interface NormalizedKnownAsset {
  normTicker: string;
  nameWords: string[];
  status: string | null;
}

/**
 * R9 / R15 / R16: Detecta créditos em conta corrente/corretora que representam proventos
 * de ativos conhecidos (por ticker ou nome do fundo), extrai quantidade "S/ <n>" e
 * redireciona recibos (TOTAL_WITHDRAWAL) para o ativo-base ACTIVE.
 */
export function detectBankIncomeCandidate(
  tx: Pick<PluggyTransaction, 'id' | 'type' | 'amount' | 'date' | 'description' | 'category' | 'categoryId'>,
  knownTickers: Set<string> | string[] | KnownIncomeAsset[],
  options?: DetectBankIncomeOptions
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

  const assetByTicker = new Map<string, NormalizedKnownAsset>();
  for (const item of knownTickers) {
    const rawTicker = typeof item === 'string' ? item : item.ticker;
    const normTicker = normalizeInvestmentTicker(rawTicker);
    if (!normTicker) continue;
    const nameWords = typeof item === 'string' || !item.name ? [] : tokenizeAlphaNum(item.name);
    const status = typeof item === 'string' ? null : item.status ?? null;
    const prev = assetByTicker.get(normTicker);
    if (!prev || (prev.status === 'TOTAL_WITHDRAWAL' && status === 'ACTIVE')) {
      assetByTicker.set(normTicker, { normTicker, nameWords, status });
    }
  }

  if (assetByTicker.size === 0) {
    return null;
  }

  const descTokens = tokenizeAlphaNum(desc);
  let matchedAsset: NormalizedKnownAsset | null = null;

  // 1. Busca por ticker na descrição
  for (const tok of descTokens) {
    const normTok = normalizeInvestmentTicker(tok);
    const found = assetByTicker.get(normTok);
    if (found) {
      matchedAsset = found;
      break;
    }
  }

  // 2. Busca pelo nome do fundo (trecho após "s/" ou "FII")
  if (!matchedAsset) {
    const queryWords = extractFundQueryWords(desc);
    if (queryWords.length > 0) {
      const allAssets = Array.from(assetByTicker.values());
      let nameMatches = allAssets.filter((a) => matchesQueryWordsInOrder(queryWords, a.nameWords));

      // Se última palavra for 1 letra truncada (ex.: "XP LOG C"), tenta sem ela
      if (
        nameMatches.length === 0 &&
        queryWords.length >= 3 &&
        queryWords[queryWords.length - 1].length === 1
      ) {
        nameMatches = allAssets.filter((a) =>
          matchesQueryWordsInOrder(queryWords.slice(0, -1), a.nameWords)
        );
      }

      if (nameMatches.length > 1) {
        options?.onAmbiguous?.();
        return null;
      }
      if (nameMatches.length === 1) {
        matchedAsset = nameMatches[0];
      } else {
        // 3. Fallback pela raiz de 4 letras do ticker (ex.: "XP LOG" -> XPLG)
        const effectiveWords =
          queryWords.length >= 3 && queryWords[queryWords.length - 1].length === 1
            ? queryWords.slice(0, -1)
            : queryWords;
        const joined = effectiveWords.join('');
        if (joined.length >= 4) {
          const rootMatches = allAssets.filter((a) => {
            if (!/^[A-Z]{4}\d{1,2}$/.test(a.normTicker)) return false;
            const root = a.normTicker.slice(0, 4);
            return root[0] === joined[0] && isSubsequence(root, joined);
          });
          if (rootMatches.length > 1) {
            options?.onAmbiguous?.();
            return null;
          }
          if (rootMatches.length === 1) {
            matchedAsset = rootMatches[0];
          }
        }
      }
    }
  }

  if (!matchedAsset) {
    return null;
  }

  // R16: Recibo em TOTAL_WITHDRAWAL vai para o ativo-base ACTIVE com sufixo 11
  let finalTicker = matchedAsset.normTicker;
  let notes: string | null = desc || null;
  if (matchedAsset.status === 'TOTAL_WITHDRAWAL') {
    const rootMatch = matchedAsset.normTicker.match(/^([A-Z]{4})\d{1,2}$/);
    if (rootMatch) {
      const baseTicker = `${rootMatch[1]}11`;
      const baseAsset = assetByTicker.get(baseTicker);
      if (baseAsset && baseAsset.status === 'ACTIVE') {
        finalTicker = baseAsset.normTicker;
        notes = desc ? `recibo ${matchedAsset.normTicker} · ${desc}` : `recibo ${matchedAsset.normTicker}`;
      }
    }
  }

  // R15: Quantidade "S/ <n>" inteiro -> quantity e unit_amount (8 casas)
  let quantity: string | null = null;
  let unitAmount: string | null = null;
  const qtyMatch = desc.match(/\bS\/\s*(\d+)\b/i);
  if (qtyMatch) {
    const n = parseInt(qtyMatch[1], 10);
    if (Number.isFinite(n) && n > 0) {
      quantity = String(n);
      unitAmount = new Decimal(tx.amount).abs().div(n).toFixed(8);
    }
  }

  const normDesc = stripAccents(desc).toLowerCase();
  let kind: 'DIVIDENDO' | 'JCP' | 'RENDIMENTO' = 'RENDIMENTO';
  if (normDesc.includes('jcp') || normDesc.includes('juros sobre capital') || normDesc.includes('juros s/ capital')) {
    kind = 'JCP';
  } else if (normDesc.includes('dividend')) {
    kind = 'DIVIDENDO';
  }

  return {
    ticker: finalTicker,
    payDate: toBrtDate(tx.date) ?? '',
    amount: new Decimal(tx.amount).abs().toFixed(2),
    kind,
    externalId: `pluggy-bank:${tx.id}`,
    notes,
    source: 'OPEN_FINANCE_BANK',
    quantity,
    unitAmount,
  };
}
