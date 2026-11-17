import type {
  PluggyAccount,
  PluggyInvestment,
  PluggyTransaction,
} from '../../services/pluggy/types';
import { normalizeInvestmentTicker } from './investments';

export interface InvestmentDisplay {
  ticker: string;
  name: string;
}

const PREPOSITIONS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'em', 'no', 'na', 'com', 'para']);
const UPPER_ACRONYMS = new Set([
  'FIC',
  'FIA',
  'FIM',
  'FIP',
  'FII',
  'ETF',
  'BDR',
  'CDB',
  'LCI',
  'LCA',
  'CRI',
  'CRA',
  'COE',
  'PGBL',
  'VGBL',
  'CDI',
  'IPCA',
  'IGPM',
  'SELIC',
  'SP',
  'RJ',
  'MG',
  'RS',
  'PR',
  'BA',
  'DF',
  'BR',
  'II',
  'III',
  'IV',
  'RT',
  'XP',
  'BTG',
]);

const FUND_STOPWORDS = new Set([
  'FUNDO',
  'FUNDOS',
  'DE',
  'DO',
  'DA',
  'DOS',
  'DAS',
  'E',
  'EM',
  'INVESTIMENTO',
  'INVESTIMENTOS',
  'FI',
  'FIC',
  'FIM',
  'FIA',
  'FIRF',
  'RF',
  'LP',
  'CP',
  'MULTIMERCADO',
  'ACOES',
  'AÇÕES',
  'RENDA',
  'FIXA',
  'CREDITO',
  'CRÉDITO',
  'PRIVADO',
  'PREVIDENCIA',
  'PREVIDÊNCIA',
  'PGBL',
  'VGBL',
]);

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toNormalCapitalization(raw: string, _preserveTwoLetterUpper = false): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word, idx) => {
      const upper = word.toUpperCase();
      const lower = word.toLowerCase();
      if (idx > 0 && PREPOSITIONS.has(lower)) {
        return lower;
      }
      if (UPPER_ACRONYMS.has(upper)) {
        return upper;
      }
      if (/^[A-Z]\.?[A-Z]\.?$/i.test(word) && upper.includes('S.A')) {
        return 'S.A.';
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function cleanIssuerName(issuer: string | null | undefined): string {
  if (!issuer) return '';
  return issuer
    .replace(/\b(?:S\.?A\.?|S\/A|LTDA\.?)(?=\s|$|\.)/gi, '')
    .replace(/\.\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function abbreviateIssuer(issuer: string | null | undefined): string {
  if (!issuer) return '';
  const norm = stripAccents(issuer).toUpperCase();
  if (norm.includes('BTG')) return 'BTG';
  if (norm.includes('BANCO DO BRASIL')) return 'BB';
  if (norm.includes('ITAU')) return 'ITAU';
  if (norm.includes('CAIXA ECONOMICA')) return 'CEF';
  if (norm.includes('SANTANDER')) return 'SANTANDER';
  if (norm.includes('BRADESCO')) return 'BRADESCO';
  if (norm.includes('NUBANK') || norm.includes('NU PAGAMENTOS')) return 'NUBANK';
  if (norm.includes('INTER')) return 'INTER';
  if (norm.includes('XP')) return 'XP';

  const ignored = new Set([
    'BANCO',
    'BCO',
    'CORRETORA',
    'DISTRIBUIDORA',
    'DTVM',
    'CTVM',
    'SECURITIZADORA',
    'INVESTIMENTOS',
    'FINANCEIRA',
    'MULTIPLO',
    'DE',
    'DO',
    'DA',
    'SA',
    'S.A.',
    'S/A',
    'LTDA',
  ]);
  const tokens = norm
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !ignored.has(t));
  if (tokens.length === 0) return 'RF';
  return tokens[0].slice(0, 10);
}

function getFixedIncomeSubtypeLabel(inv: PluggyInvestment): string {
  if (inv.type === 'COE' || inv.subtype === 'STRUCTURED_NOTE') return 'COE';
  switch (inv.subtype) {
    case 'TREASURY':
      return 'TESOURO';
    case 'DEBENTURES':
    case 'CORPORATE_DEBT':
      return 'DEB';
    case 'CDB':
    case 'LCI':
    case 'LCA':
    case 'LF':
    case 'LC':
    case 'CRI':
    case 'CRA':
      return inv.subtype;
    default:
      return 'RF';
  }
}

function formatMaturityMonthYear(dueDate: string | null | undefined): string | null {
  if (!dueDate) return null;
  const iso = dueDate.slice(0, 10);
  const [year, month] = iso.split('-');
  if (!year || !month) return null;
  return `${month}/${year}`;
}

function formatRateLabel(inv: PluggyInvestment): string | null {
  const rate = inv.rate ?? inv.fixedAnnualRate;
  if (rate === null || rate === undefined || Number.isNaN(rate)) return null;
  const rateType = (inv.rateType || '').trim().toUpperCase();
  if (rateType.includes('CDI') || rateType.includes('SELIC')) {
    return `${rate}% ${rateType.includes('SELIC') ? 'SELIC' : 'CDI'}`;
  }
  if (rateType.includes('IPCA') || rateType.includes('IGPM')) {
    return `${rateType.includes('IGPM') ? 'IGP-M' : 'IPCA'} + ${rate}%`;
  }
  return `${rate}% a.a.`;
}

function resolveCollision(
  baseTicker: string,
  inv: PluggyInvestment,
  existingTickers?: Set<string>
): string {
  if (!existingTickers || !existingTickers.has(baseTicker)) {
    return baseTicker;
  }
  const iso = inv.dueDate?.slice(0, 10);
  if (iso && iso.length === 10) {
    const suffix = `${iso.slice(5, 7)}${iso.slice(2, 4)}`;
    const candidate = `${baseTicker} ${suffix}`;
    if (!existingTickers.has(candidate)) return candidate;
  }
  const numDigits = (inv.number || '').replace(/\D/g, '');
  if (numDigits.length >= 2) {
    const candidate = `${baseTicker} ${numDigits.slice(-4)}`;
    if (!existingTickers.has(candidate)) return candidate;
  }
  let idx = 2;
  while (existingTickers.has(`${baseTicker}-${idx}`)) {
    idx += 1;
  }
  return `${baseTicker}-${idx}`;
}

export function buildInvestmentDisplay(
  inv: PluggyInvestment,
  existingTickers?: Set<string>
): InvestmentDisplay {
  const isVariableIncome =
    inv.type === 'EQUITY' ||
    inv.type === 'ETF' ||
    inv.subtype === 'STOCK' ||
    inv.subtype === 'REAL_ESTATE_FUND' ||
    inv.subtype === 'BDR' ||
    inv.subtype === 'ETF' ||
    inv.subtype === 'ETF_FUND' ||
    inv.subtype === 'FI_INFRA' ||
    inv.subtype === 'FI_AGRO';

  if (isVariableIncome) {
    const codeTicker = normalizeInvestmentTicker(inv.code);
    const fallbackWords = stripAccents(inv.name || '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const rawTicker = codeTicker || (fallbackWords[0] ? fallbackWords[0].slice(0, 8) : 'ATIVO');
    const ticker = resolveCollision(rawTicker, inv, existingTickers);
    const displayName = inv.name?.trim()
      ? toNormalCapitalization(inv.name.trim(), true)
      : ticker;
    return { ticker, name: displayName };
  }

  if (inv.type === 'FIXED_INCOME' || inv.type === 'COE') {
    const subtypeLabel = getFixedIncomeSubtypeLabel(inv);
    let baseTicker: string;
    if (inv.subtype === 'TREASURY') {
      const upperName = stripAccents(inv.name || '').toUpperCase().trim();
      baseTicker = upperName.startsWith('TESOURO') ? upperName : `TESOURO ${upperName}`.trim();
    } else {
      const abbr = abbreviateIssuer(inv.issuer || inv.institution?.name || inv.name);
      baseTicker = `${subtypeLabel} ${abbr}`.trim();
    }
    const ticker = resolveCollision(baseTicker, inv, existingTickers);

    const issuerClean = cleanIssuerName(inv.issuer || inv.institution?.name);
    const head =
      inv.subtype === 'TREASURY'
        ? toNormalCapitalization(inv.name || 'Tesouro Direto')
        : `${subtypeLabel} ${issuerClean || ''}`.trim();
    const parts: string[] = [head];
    const rateLabel = formatRateLabel(inv);
    if (rateLabel) parts.push(rateLabel);
    const venc = formatMaturityMonthYear(inv.dueDate);
    if (venc) parts.push(`venc. ${venc}`);

    return {
      ticker,
      name: parts.join(' · '),
    };
  }

  // Fundos e Previdência (MUTUAL_FUND, SECURITY, OTHER)
  const rawName = (inv.name || 'Fundo').trim();
  const cleanWords = stripAccents(rawName)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FUND_STOPWORDS.has(w));

  let baseTicker = '';
  if (cleanWords.length === 0) {
    baseTicker = 'FUNDO';
  } else if (cleanWords.length === 1) {
    baseTicker = cleanWords[0].slice(0, 10);
  } else {
    const first = cleanWords[0].slice(0, 6);
    const restInitials = cleanWords
      .slice(1, 5)
      .map((w) => (w.length <= 2 ? w : w[0]))
      .join('');
    baseTicker = `${first}${restInitials}`.slice(0, 10);
  }

  const ticker = resolveCollision(baseTicker, inv, existingTickers);
  const name = toNormalCapitalization(rawName, true);
  return { ticker, name };
}

export function buildAccountName(
  account: PluggyAccount,
  connectorName?: string | null
): string {
  const bank = (connectorName || '').trim();
  let typeLabel: string;

  if (account.type === 'CREDIT' || account.subtype === 'CREDIT_CARD') {
    typeLabel = (account.marketingName || account.name || 'Cartão').trim();
  } else if (account.subtype === 'SAVINGS_ACCOUNT') {
    typeLabel = 'Poupança';
  } else {
    typeLabel = 'Conta corrente';
  }

  const digits = (account.number || '').replace(/\D/g, '');
  const suffix = digits.length >= 4 ? ` ·· ${digits.slice(-4)}` : '';

  if (bank && !typeLabel.toLowerCase().startsWith(bank.toLowerCase())) {
    return `${bank} · ${typeLabel}${suffix}`;
  }
  return `${typeLabel}${suffix}`;
}

const TX_PREFIX_RE =
  /^(?:PIX\s+(?:ENVIADO|RECEBIDO)|COMPRA\s+CARTAO(?:\s+(?:ELO|VISA|MASTERCARD|MASTER|AMEX|HIPERCARD))?|COMPRA\s+NO\s+(?:DEBITO|CREDITO)|PAGAMENTO\s+DE\s+BOLETO|TED\s*(?:ENVIADA|ENVIADO|RECEBIDA|RECEBIDO)?|DOC\s*(?:ENVIADA|ENVIADO|RECEBIDA|RECEBIDO)?|DEBITO\s+AUTOMATICO)\s*[-:]?\s*/i;

export function cleanTransactionDescription(
  tx: Pick<PluggyTransaction, 'description' | 'descriptionRaw'> | string
): string {
  const raw =
    typeof tx === 'string'
      ? tx
      : (tx.description || tx.descriptionRaw || '').trim();
  if (!raw) return 'Lançamento';

  let cleaned = raw
    .replace(TX_PREFIX_RE, '')
    .replace(/\*/g, ' ')
    .replace(/\b\d{5,}\b/g, '')
    .replace(/^[-–—:\s]+|[-–—:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    cleaned = raw.replace(/\s+/g, ' ').trim();
  }

  return toNormalCapitalization(cleaned, true);
}
