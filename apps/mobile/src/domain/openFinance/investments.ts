import Decimal from 'decimal.js';
import type { AssetClass } from '../finance/types';
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from '../../services/pluggy/types';

export type CostBasisSource = 'TRANSACTIONS' | 'INSTITUTION' | 'MANUAL';

export type MappedInvestmentLedgerType =
  | 'BUY'
  | 'SELL'
  | 'INCOME'
  | 'AMORTIZATION'
  | 'TAX'
  | 'TRANSFER';

export interface MappedPluggyInvestment {
  externalId: string;
  itemId: string;
  assetClass: AssetClass;
  isEtf: boolean;
  ticker: string;
  name: string;
  isin: string | null;
  quantity: string;
  marketValue: string; // balance (líquido) -> manual_position_value
  grossAmount: string | null; // amount (bruto) -> gross_amount
  amountOriginal: string | null;
  amountProfitFormatted: string;
  lastMonthRateFormatted: string;
  lastTwelveMonthsRateFormatted: string;
  annualRateFormatted: string;
  rfIndexer: 'CDI' | 'IPCA' | 'PRE' | null;
  rfRate: number | null;
  rfFixedAnnualRate: number | null;
  rfMaturityDate: string | null;
  rfIssuer: string | null;
  rfIsTaxExempt: boolean;
  status: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL';
  source: 'OPEN_FINANCE';
}

export interface MappedPluggyInvestmentTransaction {
  externalId: string;
  investmentId: string;
  type: MappedInvestmentLedgerType;
  tradeDate: string; // YYYY-MM-DD
  quantity: string;
  unitPrice: string;
  fees: string;
  totalAmount: string;
  notes: string | null;
  source: 'OPEN_FINANCE';
}

export interface InvestmentCostBasisResult {
  averagePrice: string;
  totalInvested: string;
  costBasisSource: CostBasisSource;
  coveredByHistory: boolean;
}

export interface InvestmentMatchCandidate {
  id: string;
  portfolioId: string;
  ticker: string;
  name: string;
  assetClass: AssetClass;
  isin?: string | null;
  rfIssuer?: string | null;
  rfMaturityDate?: string | null;
  rfRate?: number | null;
  externalId?: string | null;
  source?: string | null;
}

export type InvestmentMatchStrategy =
  | 'EXTERNAL_ID'
  | 'ISIN'
  | 'TICKER'
  | 'FIXED_INCOME_KEY'
  | 'NONE';

export interface InvestmentMatchResult {
  matchedAssetId: string | null;
  strategy: InvestmentMatchStrategy;
  confidence: 'HIGH' | 'MEDIUM' | 'NONE';
}

export interface ClassCoverageStatus {
  assetClass: AssetClass;
  label: string;
  exposedByOpenFinance: boolean;
  sourceHint: string;
}

export function normalizeInvestmentTicker(ticker: string | null | undefined): string {
  const cleaned = (ticker || '').trim().toUpperCase();
  if (!cleaned) return '';
  // Remove sufixo fracionário B3 (ex: PETR4F -> PETR4, MGLU3F -> MGLU3)
  if (/^[A-Z]{4}\d{1,2}F$/.test(cleaned)) {
    return cleaned.slice(0, -1);
  }
  return cleaned;
}

export function formatNullableOpenFinanceMetric(
  value: number | null | undefined,
  suffix: string = ''
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return `${new Decimal(value).toFixed(2)}${suffix}`;
}

function mapRfIndexer(rateType: string | null | undefined): 'CDI' | 'IPCA' | 'PRE' | null {
  const upper = (rateType || '').trim().toUpperCase();
  if (!upper) return null;
  if (upper.includes('CDI') || upper.includes('SELIC')) return 'CDI';
  if (upper.includes('IPCA') || upper.includes('IGPM')) return 'IPCA';
  if (upper.includes('PRE') || upper.includes('FIX')) return 'PRE';
  return null;
}

function normalizeIsoDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return dateStr.slice(0, 10);
}

function resolvePluggyAssetClass(inv: PluggyInvestment): { assetClass: AssetClass; isEtf: boolean } {
  const type = inv.type;
  const subtype = inv.subtype || 'OTHER';

  if (type === 'ETF' || (type === 'EQUITY' && subtype === 'ETF')) {
    return { assetClass: 'STOCK', isEtf: true };
  }
  if (type === 'EQUITY') {
    if (subtype === 'REAL_ESTATE_FUND') {
      return { assetClass: 'FII', isEtf: false };
    }
    return { assetClass: 'STOCK', isEtf: false };
  }
  if (type === 'FIXED_INCOME' || type === 'COE') {
    return { assetClass: 'FIXED_INCOME', isEtf: false };
  }
  if (type === 'MUTUAL_FUND' || type === 'SECURITY') {
    return { assetClass: 'FUNDS', isEtf: false };
  }
  return { assetClass: 'FIXED_INCOME', isEtf: false };
}

export function mapPluggyInvestment(inv: PluggyInvestment): MappedPluggyInvestment {
  const { assetClass, isEtf } = resolvePluggyAssetClass(inv);
  const status = inv.status || 'ACTIVE';

  const normalizedCode = normalizeInvestmentTicker(inv.code);
  const ticker =
    normalizedCode ||
    (inv.isin ? inv.isin.trim().toUpperCase() : '') ||
    (inv.name ? inv.name.trim().toUpperCase().slice(0, 24) : inv.id);

  const qtyNum =
    status === 'TOTAL_WITHDRAWAL'
      ? 0
      : inv.quantity !== null && inv.quantity !== undefined
      ? inv.quantity
      : inv.balance > 0
      ? 1
      : 0;

  const balanceDec = new Decimal(status === 'TOTAL_WITHDRAWAL' ? 0 : inv.balance ?? 0);
  const grossDec =
    inv.amount !== null && inv.amount !== undefined ? new Decimal(inv.amount).toFixed(2) : null;
  const origDec =
    inv.amountOriginal !== null && inv.amountOriginal !== undefined
      ? new Decimal(inv.amountOriginal).toFixed(2)
      : null;

  return {
    externalId: inv.id,
    itemId: inv.itemId,
    assetClass,
    isEtf,
    ticker,
    name: inv.name || ticker,
    isin: inv.isin ? inv.isin.trim().toUpperCase() : null,
    quantity: new Decimal(qtyNum).toString(),
    marketValue: balanceDec.toFixed(2),
    grossAmount: grossDec,
    amountOriginal: origDec,
    amountProfitFormatted: formatNullableOpenFinanceMetric(inv.amountProfit),
    lastMonthRateFormatted: formatNullableOpenFinanceMetric(inv.lastMonthRate, '%'),
    lastTwelveMonthsRateFormatted: formatNullableOpenFinanceMetric(inv.lastTwelveMonthsRate, '%'),
    annualRateFormatted: formatNullableOpenFinanceMetric(inv.annualRate, '%'),
    rfIndexer: mapRfIndexer(inv.rateType),
    rfRate: inv.rate ?? inv.fixedAnnualRate ?? null,
    rfFixedAnnualRate: inv.fixedAnnualRate ?? null,
    rfMaturityDate: normalizeIsoDate(inv.dueDate),
    rfIssuer: inv.issuer ? inv.issuer.trim() : null,
    rfIsTaxExempt: Boolean(inv.taxExempt),
    status,
    source: 'OPEN_FINANCE',
  };
}

export function mapPluggyInvestmentTransaction(
  tx: PluggyInvestmentTransaction,
  investmentId: string = ''
): MappedPluggyInvestmentTransaction {
  const typeMap: Record<PluggyInvestmentTransaction['type'], MappedInvestmentLedgerType> = {
    BUY: 'BUY',
    SELL: 'SELL',
    INTEREST: 'INCOME',
    AMORTIZATION: 'AMORTIZATION',
    TAX: 'TAX',
    TRANSFER: 'TRANSFER',
  };
  const mappedType = typeMap[tx.type] || 'TRANSFER';

  const qtyDec = new Decimal(tx.quantity ?? 1);
  const amountDec = new Decimal(tx.amount ?? 0).abs();
  const unitPriceDec =
    tx.value !== null && tx.value !== undefined
      ? new Decimal(tx.value)
      : qtyDec.gt(0)
      ? amountDec.div(qtyDec)
      : amountDec;

  let feesDec = new Decimal(0);
  if (tx.netAmount !== null && tx.netAmount !== undefined && tx.amount !== null && tx.amount !== undefined) {
    feesDec = new Decimal(tx.netAmount).abs().minus(new Decimal(tx.amount).abs()).abs();
  }

  const totalAmountDec =
    tx.netAmount !== null && tx.netAmount !== undefined
      ? new Decimal(tx.netAmount).abs()
      : amountDec.plus(feesDec);

  return {
    externalId: tx.id,
    investmentId,
    type: mappedType,
    tradeDate: (tx.tradeDate || tx.date).slice(0, 10),
    quantity: qtyDec.toString(),
    unitPrice: unitPriceDec.toFixed(2),
    fees: feesDec.toFixed(2),
    totalAmount: totalAmountDec.toFixed(2),
    notes: tx.description ?? null,
    source: 'OPEN_FINANCE',
  };
}

export function calculateInvestmentCostBasis(
  inv: PluggyInvestment,
  txs: MappedPluggyInvestmentTransaction[]
): InvestmentCostBasisResult {
  const targetQty = new Decimal(inv.quantity ?? 0);
  const sorted = [...txs].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  let qty = new Decimal(0);
  let totalCost = new Decimal(0);
  let hasBuyOrTransfer = false;

  for (const tx of sorted) {
    const q = new Decimal(tx.quantity || 0);
    const p = new Decimal(tx.unitPrice || 0);
    const fees = new Decimal(tx.fees || 0);

    if (tx.type === 'BUY' || tx.type === 'TRANSFER') {
      hasBuyOrTransfer = true;
      totalCost = totalCost.plus(q.mul(p)).plus(fees);
      qty = qty.plus(q);
    } else if (tx.type === 'SELL') {
      if (qty.gt(0)) {
        const avg = totalCost.div(qty);
        const sellQty = Decimal.min(q, qty);
        qty = qty.minus(sellQty);
        totalCost = totalCost.minus(sellQty.mul(avg));
      }
    }
  }

  const qtyMatches =
    hasBuyOrTransfer &&
    targetQty.gt(0) &&
    qty.minus(targetQty).abs().lte(new Decimal('0.0001'));

  if (qtyMatches) {
    const avg = totalCost.div(qty);
    return {
      averagePrice: avg.toFixed(2),
      totalInvested: totalCost.toFixed(2),
      costBasisSource: 'TRANSACTIONS',
      coveredByHistory: true,
    };
  }

  // Fallback para histórico incompleto: amountOriginal ÷ quantity
  const orig = new Decimal(inv.amountOriginal ?? inv.amount ?? inv.balance ?? 0);
  const denom = targetQty.gt(0) ? targetQty : new Decimal(1);
  const avg = orig.div(denom);
  return {
    averagePrice: avg.toFixed(2),
    totalInvested: orig.toFixed(2),
    costBasisSource: 'INSTITUTION',
    coveredByHistory: false,
  };
}

export function matchInvestmentToAsset(
  inv: PluggyInvestment,
  existingAssets: InvestmentMatchCandidate[]
): InvestmentMatchResult {
  // 0. External ID direto
  const byExt = existingAssets.find((a) => a.externalId && a.externalId === inv.id);
  if (byExt) {
    return { matchedAssetId: byExt.id, strategy: 'EXTERNAL_ID', confidence: 'HIGH' };
  }

  // 1. ISIN
  const invIsin = (inv.isin || '').trim().toUpperCase();
  if (invIsin) {
    const byIsin = existingAssets.find(
      (a) => a.isin && a.isin.trim().toUpperCase() === invIsin
    );
    if (byIsin) {
      return { matchedAssetId: byIsin.id, strategy: 'ISIN', confidence: 'HIGH' };
    }
  }

  // 2. Ticker normalizado
  const invTicker = normalizeInvestmentTicker(inv.code);
  if (invTicker) {
    const byTicker = existingAssets.find(
      (a) => normalizeInvestmentTicker(a.ticker) === invTicker
    );
    if (byTicker) {
      return { matchedAssetId: byTicker.id, strategy: 'TICKER', confidence: 'HIGH' };
    }
  }

  // 3. Renda fixa: (emissor + vencimento + taxa)
  const { assetClass } = resolvePluggyAssetClass(inv);
  if (assetClass === 'FIXED_INCOME') {
    const invIssuer = (inv.issuer || '').trim().toLowerCase();
    const invDue = normalizeIsoDate(inv.dueDate);
    const invRate = inv.rate ?? inv.fixedAnnualRate ?? null;

    if (invIssuer && invDue && invRate !== null) {
      const byRf = existingAssets.find((a) => {
        if (a.assetClass !== 'FIXED_INCOME') return false;
        const aIssuer = (a.rfIssuer || '').trim().toLowerCase();
        const aDue = normalizeIsoDate(a.rfMaturityDate);
        const aRate = a.rfRate ?? null;
        return (
          aIssuer === invIssuer &&
          aDue === invDue &&
          aRate !== null &&
          Math.abs(aRate - invRate) < 0.01
        );
      });
      if (byRf) {
        return { matchedAssetId: byRf.id, strategy: 'FIXED_INCOME_KEY', confidence: 'MEDIUM' };
      }
    }
  }

  return { matchedAssetId: null, strategy: 'NONE', confidence: 'NONE' };
}

const CLASS_LABELS: Array<{ assetClass: AssetClass; label: string }> = [
  { assetClass: 'FIXED_INCOME', label: 'Renda Fixa' },
  { assetClass: 'STOCK', label: 'Ações & ETFs' },
  { assetClass: 'FII', label: 'FIIs' },
  { assetClass: 'FUNDS', label: 'Fundos e Previdência' },
];

export function computeClassCoverageReport(
  investments: PluggyInvestment[]
): ClassCoverageStatus[] {
  const exposedSet = new Set<AssetClass>();
  for (const inv of investments) {
    const { assetClass } = resolvePluggyAssetClass(inv);
    exposedSet.add(assetClass);
  }

  return CLASS_LABELS.map(({ assetClass, label }) => {
    const exposed = exposedSet.has(assetClass);
    return {
      assetClass,
      label,
      exposedByOpenFinance: exposed,
      sourceHint: exposed
        ? 'Sincronizado via Open Finance (Pluggy)'
        : 'Não exposto pela instituição — continua vindo da B3 e do manual',
    };
  });
}

export function formatMissingSinceLabel(missingSinceIso: string): string {
  const datePart = missingSinceIso.slice(0, 10);
  const [, month, day] = datePart.split('-');
  if (!month || !day) return 'não informado';
  return `não informado desde ${day}/${month}`;
}
