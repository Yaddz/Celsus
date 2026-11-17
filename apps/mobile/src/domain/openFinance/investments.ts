import Decimal from 'decimal.js';
import type { AssetClass } from '../finance/types';
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from '../../services/pluggy/types';
import { buildInvestmentDisplay } from './naming';

export type CostBasisSource = 'TRANSACTIONS' | 'INSTITUTION' | 'MANUAL' | 'UNKNOWN';

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
  marketValue: string | null; // balance (líquido) -> manual_position_value (null para ações/FIIs/ETFs/BDRs)
  grossAmount: string | null; // amount (bruto) -> gross_amount
  amountOriginal: string | null;
  issuerCnpj?: string | null;
  issueDate?: string | null;
  purchaseDate?: string | null;
  taxes?: string | null;
  taxes2?: string | null;
  amountProfitFormatted: string;
  lastMonthRateFormatted: string;
  lastTwelveMonthsRateFormatted: string;
  annualRateFormatted: string;
  rfIndexer: 'CDI' | 'IPCA' | 'PRE' | null;
  rfRate: number | null;
  rfIndexerPct: number | null;
  rfFixedAnnualRate: number | null;
  rfMaturityDate: string | null;
  rfIssuer: string | null;
  rfIsTaxExempt: boolean;
  ofReportedValue: string;
  ofReportedAt: string;
  valueSource: ValueSource;
  status: 'ACTIVE' | 'PENDING' | 'TOTAL_WITHDRAWAL';
  source: 'OPEN_FINANCE';
  warnings: string[];
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
  warnings: string[];
  /** Número da nota de corretagem (Sprint 95). */
  brokerageNumber?: string | null;
  /** Valor bruto da operação, sem taxas (Sprint 95). */
  grossAmount?: string;
}

export interface OpeningAdjustment {
  quantity: string;
  totalCost: string;
  tradeDate: string;
}

export interface InvestmentCostBasisResult {
  averagePrice: string | null;
  totalInvested: string | null;
  costBasisSource: CostBasisSource;
  coveredByHistory: boolean;
  openingAdjustment: OpeningAdjustment | null;
  closingAdjustment: OpeningAdjustment | null;
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
  institutionId?: string | null;
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

export type ValueSource = 'QUOTE' | 'INSTITUTION' | 'MANUAL';

const VALID_B3_TICKER_RE = /^[A-Z]{4}\d{1,2}$/;

export function resolveVariableIncomeValueSource(params: {
  ticker: string | null | undefined;
  quantity: string | number | null | undefined;
  balance: string | number | null | undefined;
  quote: string | number | null | undefined;
}): ValueSource {
  const cleanTicker = (params.ticker || '').trim().toUpperCase();
  if (!cleanTicker || !VALID_B3_TICKER_RE.test(cleanTicker)) {
    return 'INSTITUTION';
  }
  if (
    params.quote === null ||
    params.quote === undefined ||
    params.quote === '' ||
    params.balance === null ||
    params.balance === undefined ||
    params.balance === '' ||
    params.quantity === null ||
    params.quantity === undefined ||
    params.quantity === ''
  ) {
    return 'INSTITUTION';
  }
  try {
    const qty = new Decimal(params.quantity);
    const bal = new Decimal(params.balance);
    const quote = new Decimal(params.quote);
    if (qty.lte(0) || bal.lte(0) || quote.lte(0)) {
      return 'INSTITUTION';
    }
    const quoteTotal = quote.mul(qty);
    const diffRatio = quoteTotal.minus(bal).abs().div(bal);
    return diffRatio.lte(new Decimal('0.15')) ? 'QUOTE' : 'INSTITUTION';
  } catch {
    return 'INSTITUTION';
  }
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

export function resolvePluggyFixedIncomeRates(
  inv: Pick<PluggyInvestment, 'rateType' | 'rate' | 'fixedAnnualRate'>
): {
  rfIndexer: 'CDI' | 'IPCA' | 'PRE' | null;
  rfRate: number | null;
  rfIndexerPct: number | null;
  warnings: string[];
} {
  const rfIndexer = mapRfIndexer(inv.rateType);
  const warnings: string[] = [];
  let rfRate: number | null = null;
  let rfIndexerPct: number | null = null;

  if (rfIndexer === 'CDI') {
    const raw = inv.rate ?? null;
    if (raw !== null) {
      if (raw < 50 || raw > 200) {
        warnings.push(`Taxa CDI/SELIC fora da faixa plausível (50–200%): ${raw}`);
      } else {
        rfRate = raw;
      }
    }
  } else if (rfIndexer === 'PRE') {
    const raw = inv.fixedAnnualRate ?? inv.rate ?? null;
    if (raw !== null) {
      if (raw < 0 || raw > 30) {
        warnings.push(`Taxa PRE fora da faixa plausível (0–30%): ${raw}`);
      } else {
        rfRate = raw;
      }
    }
  } else if (rfIndexer === 'IPCA') {
    const rawSpread = inv.fixedAnnualRate ?? null;
    if (rawSpread !== null) {
      if (rawSpread < 0 || rawSpread > 30) {
        warnings.push(`Spread IPCA/IGPM fora da faixa plausível (0–30%): ${rawSpread}`);
      } else {
        rfRate = rawSpread;
      }
    }
    rfIndexerPct = inv.rate ?? null;
  } else {
    rfRate = inv.rate ?? inv.fixedAnnualRate ?? null;
  }

  return { rfIndexer, rfRate, rfIndexerPct, warnings };
}

function normalizeIsoDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  return dateStr.slice(0, 10);
}

export function resolvePluggyAssetClass(inv: PluggyInvestment): { assetClass: AssetClass; isEtf: boolean } {
  const type = inv.type;
  const subtype = inv.subtype || 'OTHER';

  if (subtype === 'OPTION' || subtype === 'DERIVATIVES') {
    return { assetClass: 'FUNDS', isEtf: false };
  }
  if (type === 'ETF' || subtype === 'ETF' || subtype === 'ETF_FUND') {
    return { assetClass: 'STOCK', isEtf: true };
  }
  if (subtype === 'REAL_ESTATE_FUND' || subtype === 'FI_INFRA' || subtype === 'FI_AGRO') {
    return { assetClass: 'FII', isEtf: false };
  }
  if (type === 'EQUITY') {
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

function resolvePositionPriceFactor(
  inv: Pick<PluggyInvestment, 'priceFactor'>,
  txPriceFactors?: Array<number | null | undefined>
): { factor: Decimal; warnings: string[] } {
  const uniqueTxFactors = Array.from(
    new Set(
      (txPriceFactors ?? []).filter(
        (f): f is number => typeof f === 'number' && Number.isFinite(f) && f > 1
      )
    )
  );
  const warnings: string[] = [];

  if (inv.priceFactor !== null && inv.priceFactor !== undefined && inv.priceFactor > 1) {
    if (uniqueTxFactors.some((f) => f !== inv.priceFactor)) {
      warnings.push(
        `Fatores de lote (priceFactor) divergentes entre posição (${inv.priceFactor}) e transações (${uniqueTxFactors.join(', ')}); posição mantida sem multiplicação.`
      );
      return { factor: new Decimal(1), warnings };
    }
    return { factor: new Decimal(inv.priceFactor), warnings };
  }

  if (uniqueTxFactors.length === 1) {
    warnings.push(
      `priceFactor ausente na posição; aplicado fator ${uniqueTxFactors[0]} das transações.`
    );
    return { factor: new Decimal(uniqueTxFactors[0]), warnings };
  }

  if (uniqueTxFactors.length > 1) {
    warnings.push(
      `Fatores de lote (priceFactor) divergentes nas transações (${uniqueTxFactors.join(', ')}); posição mantida sem multiplicação.`
    );
    return { factor: new Decimal(1), warnings };
  }

  return { factor: new Decimal(1), warnings };
}

export function mapPluggyInvestment(
  inv: PluggyInvestment,
  existingTickers?: Set<string>,
  existingNames?: Set<string>,
  txPriceFactors?: Array<number | null | undefined>
): MappedPluggyInvestment {
  const { assetClass, isEtf } = resolvePluggyAssetClass(inv);
  const status = inv.status || 'ACTIVE';
  const isVariableIncome = assetClass === 'STOCK' || assetClass === 'FII';

  const display = buildInvestmentDisplay(inv, existingTickers, existingNames);
  const pf = resolvePositionPriceFactor(inv, txPriceFactors);

  let qtyDec = new Decimal(0);
  if (status !== 'TOTAL_WITHDRAWAL') {
    if (inv.quantity !== null && inv.quantity !== undefined) {
      qtyDec = new Decimal(inv.quantity).mul(pf.factor);
    } else if (!isVariableIncome && inv.balance > 0) {
      qtyDec = new Decimal(1);
    }
  }

  const balanceDec = new Decimal(status === 'TOTAL_WITHDRAWAL' ? 0 : inv.balance ?? 0);
  const ofReportedValue = balanceDec.toFixed(2);
  const ofReportedAt =
    normalizeIsoDate(inv.date) ||
    normalizeIsoDate(inv.updatedAt) ||
    new Date().toISOString().slice(0, 10);

  const hasValidVariableTicker =
    Boolean(inv.code?.trim() || inv.isin?.trim()) && VALID_B3_TICKER_RE.test(display.ticker);
  const valueSource: ValueSource =
    isVariableIncome && hasValidVariableTicker ? 'QUOTE' : 'INSTITUTION';
  const marketValue = valueSource === 'QUOTE' ? null : ofReportedValue;
  const grossDec =
    inv.amount !== null && inv.amount !== undefined ? new Decimal(inv.amount).toFixed(2) : null;
  const origDec =
    inv.amountOriginal !== null && inv.amountOriginal !== undefined
      ? new Decimal(inv.amountOriginal).toFixed(2)
      : null;

  const rfRates = resolvePluggyFixedIncomeRates(inv);

  return {
    externalId: inv.id,
    itemId: inv.itemId,
    assetClass,
    isEtf,
    ticker: display.ticker,
    name: display.name,
    isin: inv.isin ? inv.isin.trim().toUpperCase() : null,
    quantity: qtyDec.toString(),
    marketValue,
    grossAmount: grossDec,
    amountOriginal: origDec,
    issuerCnpj: inv.issuerCNPJ ? inv.issuerCNPJ.trim() : null,
    issueDate: normalizeIsoDate(inv.issueDate),
    purchaseDate: normalizeIsoDate(inv.purchaseDate),
    taxes:
      inv.taxes !== null && inv.taxes !== undefined ? new Decimal(inv.taxes).toFixed(2) : null,
    taxes2:
      inv.taxes2 !== null && inv.taxes2 !== undefined ? new Decimal(inv.taxes2).toFixed(2) : null,
    amountProfitFormatted: formatNullableOpenFinanceMetric(inv.amountProfit),
    lastMonthRateFormatted: formatNullableOpenFinanceMetric(inv.lastMonthRate, '%'),
    lastTwelveMonthsRateFormatted: formatNullableOpenFinanceMetric(inv.lastTwelveMonthsRate, '%'),
    annualRateFormatted: formatNullableOpenFinanceMetric(inv.annualRate, '%'),
    rfIndexer: rfRates.rfIndexer,
    rfRate: rfRates.rfRate,
    rfIndexerPct: rfRates.rfIndexerPct,
    rfFixedAnnualRate: inv.fixedAnnualRate ?? null,
    rfMaturityDate: normalizeIsoDate(inv.dueDate),
    rfIssuer: inv.issuer ? inv.issuer.trim() : null,
    rfIsTaxExempt: Boolean(inv.taxExempt),
    ofReportedValue,
    ofReportedAt,
    valueSource,
    status,
    source: 'OPEN_FINANCE',
    warnings: [...pf.warnings, ...rfRates.warnings],
  };
}

const ALLOWED_EXPENSE_KEYS = [
  'brokerageFee',
  'settlementFee',
  'clearingFee',
  'stockExchangeFee',
  'tradingAssetsNoticeFee',
  'custodyFee',
  'operatingFee',
  'serviceTax',
  'maintenanceFee',
  'registryFee',
  'exchangeFee',
  'iof',
  'other',
] as const;

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
  const warnings: string[] = [];

  const hasPositiveQty = tx.quantity !== null && tx.quantity !== undefined && tx.quantity > 0;
  const baseQtyDec = hasPositiveQty
    ? new Decimal(tx.quantity!)
    : new Decimal(mappedType === 'BUY' || mappedType === 'SELL' ? 1 : 0);

  const priceFactor =
    tx.priceFactor !== null && tx.priceFactor !== undefined && tx.priceFactor > 1
      ? new Decimal(tx.priceFactor)
      : null;
  const qtyDec = priceFactor ? baseQtyDec.mul(priceFactor) : baseQtyDec;

  const amountDec = new Decimal(tx.amount ?? 0).abs();
  const unitPriceDec = qtyDec.gt(0) ? amountDec.div(qtyDec) : amountDec;

  if (tx.value !== null && tx.value !== undefined) {
    const valueDec = new Decimal(tx.value).abs();
    const expectedTotal = valueDec.mul(qtyDec);
    if (amountDec.gt(0)) {
      const diffRatio = expectedTotal.minus(amountDec).abs().div(amountDec);
      if (diffRatio.gt(new Decimal('0.01'))) {
        warnings.push(
          `Divergência > 1% entre value×quantity (${expectedTotal.toFixed(2)}) e amount (${amountDec.toFixed(2)})`
        );
      }
    } else if (valueDec.gt(0) && qtyDec.gt(0)) {
      warnings.push(
        `Transação com value=${valueDec.toFixed(2)} e quantity=${qtyDec.toString()}, mas amount=0`
      );
    }
  }

  let feesDec = new Decimal(0);
  const taxNotes: string[] = [];
  if (tx.expenses !== null && tx.expenses !== undefined) {
    for (const key of ALLOWED_EXPENSE_KEYS) {
      const val = tx.expenses[key];
      if (typeof val === 'number' && Number.isFinite(val)) {
        const valDec = new Decimal(val).abs();
        // Sprint 95: despesa >= valor da operação é o total da nota de corretagem, não uma taxa
        if (amountDec.gt(0) && valDec.gte(amountDec)) {
          warnings.push(
            `Despesa ${key} (R$ ${valDec.toFixed(2)}) maior ou igual ao valor da operação: tratada como total da nota e ignorada.`
          );
          continue;
        }
        feesDec = feesDec.plus(valDec);
      }
    }
    if (
      typeof tx.expenses.incomeTax === 'number' &&
      Number.isFinite(tx.expenses.incomeTax) &&
      tx.expenses.incomeTax !== 0
    ) {
      taxNotes.push(
        `IR retido R$ ${new Decimal(tx.expenses.incomeTax).abs().toFixed(2).replace('.', ',')}`
      );
    }
    if (
      typeof tx.expenses.iofProvision === 'number' &&
      Number.isFinite(tx.expenses.iofProvision) &&
      tx.expenses.iofProvision !== 0
    ) {
      taxNotes.push(
        `Provisão IOF R$ ${new Decimal(tx.expenses.iofProvision).abs().toFixed(2).replace('.', ',')}`
      );
    }
  } else if (
    tx.netAmount !== null &&
    tx.netAmount !== undefined &&
    tx.amount !== null &&
    tx.amount !== undefined
  ) {
    feesDec = new Decimal(tx.netAmount).abs().minus(new Decimal(tx.amount).abs()).abs();
  }

  let totalAmountDec: Decimal;
  if (mappedType === 'BUY') {
    totalAmountDec = amountDec.plus(feesDec);
  } else if (mappedType === 'SELL') {
    totalAmountDec =
      tx.netAmount !== null && tx.netAmount !== undefined
        ? new Decimal(tx.netAmount).abs()
        : Decimal.max(0, amountDec.minus(feesDec));
  } else {
    totalAmountDec =
      tx.netAmount !== null && tx.netAmount !== undefined
        ? new Decimal(tx.netAmount).abs()
        : amountDec.plus(feesDec);
  }

  const noteParts: string[] = [];
  if (tx.description && tx.description.trim()) {
    noteParts.push(tx.description.trim());
  }
  noteParts.push(...taxNotes);

  return {
    externalId: tx.id,
    investmentId,
    type: mappedType,
    tradeDate: (tx.tradeDate || tx.date).slice(0, 10),
    quantity: qtyDec.toString(),
    unitPrice: unitPriceDec.toFixed(8),
    fees: feesDec.toFixed(2),
    totalAmount: totalAmountDec.toFixed(2),
    notes: noteParts.length > 0 ? noteParts.join(' · ') : null,
    source: 'OPEN_FINANCE',
    warnings,
    brokerageNumber: tx.brokerageNumber ? String(tx.brokerageNumber).trim() || null : null,
    grossAmount: amountDec.toFixed(2),
  };
}

/**
 * Sprint 95: rateia pelo valor de cada operação as taxas da nota repetidas em várias operações. Stub da Fase A.
 */
export function prorateSharedNoteFees(
  txs: MappedPluggyInvestmentTransaction[]
): MappedPluggyInvestmentTransaction[] {
  const groups = new Map<string, number[]>();
  txs.forEach((t, idx) => {
    if (t.type !== 'BUY' && t.type !== 'SELL') return;
    if (!new Decimal(t.fees || 0).gt(0)) return;
    const key = t.brokerageNumber ? `bn:${t.brokerageNumber}|${t.tradeDate}` : `d:${t.tradeDate}`;
    const list = groups.get(key) ?? [];
    list.push(idx);
    groups.set(key, list);
  });

  const out = txs.map((t) => ({ ...t, warnings: [...t.warnings] }));
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    const fee = out[idxs[0]].fees;
    if (!idxs.every((i) => out[i].fees === fee)) continue;

    const total = new Decimal(fee);
    const grossOf = (i: number) =>
      new Decimal(
        out[i].grossAmount ?? new Decimal(out[i].unitPrice || 0).mul(out[i].quantity || 0).toFixed(2)
      );
    const sumGross = idxs.reduce((acc, i) => acc.plus(grossOf(i)), new Decimal(0));
    if (!sumGross.gt(0)) continue;

    const shares = idxs.map((i) => total.mul(grossOf(i)).div(sumGross).toDecimalPlaces(2));
    const residue = total.minus(shares.reduce((acc, s) => acc.plus(s), new Decimal(0)));
    if (!residue.isZero()) {
      let largest = 0;
      idxs.forEach((i, k) => {
        if (grossOf(i).gt(grossOf(idxs[largest]))) largest = k;
      });
      shares[largest] = shares[largest].plus(residue);
    }

    idxs.forEach((i, k) => {
      const t = out[i];
      const gross = grossOf(i);
      const share = shares[k];
      t.fees = share.toFixed(2);
      t.totalAmount =
        t.type === 'BUY' ? gross.plus(share).toFixed(2) : Decimal.max(0, gross.minus(share)).toFixed(2);
      t.warnings.push(
        `Taxas da nota (R$ ${total.toFixed(2)}) repetidas em ${idxs.length} operações: rateadas pelo valor de cada uma.`
      );
    });
  }
  return out;
}

function subtractOneDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function addOneDay(isoDate: string): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function calculateInvestmentCostBasis(
  inv: PluggyInvestment,
  txs: MappedPluggyInvestmentTransaction[],
  txPriceFactors?: Array<number | null | undefined>
): InvestmentCostBasisResult {
  const { assetClass } = resolvePluggyAssetClass(inv);
  const isVariableIncome = assetClass === 'STOCK' || assetClass === 'FII';
  const pf = resolvePositionPriceFactor(inv, txPriceFactors);
  const targetQty =
    inv.quantity !== null && inv.quantity !== undefined
      ? new Decimal(inv.quantity).mul(pf.factor)
      : !isVariableIncome && (inv.balance ?? 0) > 0
      ? new Decimal(1)
      : new Decimal(0);
  const sorted = [...txs].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));

  let qty = new Decimal(0);
  let totalCost = new Decimal(0);
  let hasCostHistory = false;
  const buySignatures = new Set<string>();

  for (const tx of sorted) {
    const q = new Decimal(tx.quantity || 0);
    const p = new Decimal(tx.unitPrice || 0);
    const fees = new Decimal(tx.fees || 0);

    if (tx.type === 'BUY') {
      hasCostHistory = true;
      totalCost = totalCost.plus(q.mul(p)).plus(fees);
      qty = qty.plus(q);
      buySignatures.add(`${tx.tradeDate}:${q.toString()}:${p.toFixed(8)}`);
    } else if (tx.type === 'TRANSFER') {
      const sig = `${tx.tradeDate}:${q.toString()}:${p.toFixed(8)}`;
      if (q.gt(0) && p.gt(0) && !buySignatures.has(sig)) {
        hasCostHistory = true;
        totalCost = totalCost.plus(q.mul(p)).plus(fees);
        qty = qty.plus(q);
        buySignatures.add(sig);
      }
    } else if (tx.type === 'SELL') {
      if (qty.gt(0)) {
        const avg = totalCost.div(qty);
        const sellQty = Decimal.min(q, qty);
        qty = qty.minus(sellQty);
        totalCost = totalCost.minus(sellQty.mul(avg));
      }
    } else if (tx.type === 'AMORTIZATION') {
      const amort = new Decimal(tx.totalAmount || 0);
      totalCost = Decimal.max(0, totalCost.minus(amort));
    }
    // TAX não altera quantidade nem preço médio diretamente
  }

  const qtyMatches =
    hasCostHistory &&
    targetQty.gt(0) &&
    qty.minus(targetQty).abs().lte(new Decimal('0.0001'));

  if (qtyMatches) {
    const avg = totalCost.div(qty);
    return {
      averagePrice: avg.toFixed(8),
      totalInvested: totalCost.toFixed(2),
      costBasisSource: 'TRANSACTIONS',
      coveredByHistory: true,
      openingAdjustment: null,
      closingAdjustment: null,
    };
  }

  // Fallback para histórico incompleto: apenas amountOriginal ÷ quantity (R4)
  if (inv.amountOriginal !== null && inv.amountOriginal !== undefined) {
    const orig = new Decimal(inv.amountOriginal);
    const denom = targetQty.gt(0) ? targetQty : new Decimal(1);
    const avg = orig.div(denom);

    let openingAdjustment: OpeningAdjustment | null = null;
    let closingAdjustment: OpeningAdjustment | null = null;
    const remainingQty = targetQty.minus(qty);
    const remainingCost = orig.minus(totalCost);
    if (remainingQty.gt(new Decimal('0.0001')) && remainingCost.gte(0)) {
      const tradeDate =
        normalizeIsoDate(inv.purchaseDate) ??
        normalizeIsoDate(inv.issueDate) ??
        (sorted.length > 0 ? subtractOneDay(sorted[0].tradeDate) : null) ??
        normalizeIsoDate(inv.date) ??
        new Date().toISOString().slice(0, 10);
      openingAdjustment = {
        quantity: remainingQty.toString(),
        totalCost: remainingCost.toFixed(2),
        tradeDate,
      };
    } else if (qty.minus(targetQty).gt(new Decimal('0.0001')) && hasCostHistory && qty.gt(0)) {
      const excessQty = qty.minus(targetQty);
      const bookAvg = totalCost.div(qty);
      const tradeDate =
        sorted.length > 0
          ? addOneDay(sorted[sorted.length - 1].tradeDate)
          : normalizeIsoDate(inv.date) ?? new Date().toISOString().slice(0, 10);
      closingAdjustment = {
        quantity: excessQty.toString(),
        totalCost: excessQty.mul(bookAvg).toFixed(2),
        tradeDate,
      };
    }

    return {
      averagePrice: avg.toFixed(8),
      totalInvested: orig.toFixed(2),
      costBasisSource: 'INSTITUTION',
      coveredByHistory: false,
      openingAdjustment,
      closingAdjustment,
    };
  }

  // Sem amountOriginal (R13): ajusta quantidade do livro para fechar posição sem inventar custo
  const remainingQty = targetQty.minus(qty);
  if (targetQty.gt(0) && remainingQty.gt(new Decimal('0.0001'))) {
    const unitPrice =
      hasCostHistory && qty.gt(0) && totalCost.gt(0)
        ? totalCost.div(qty)
        : inv.balance !== null && inv.balance !== undefined && inv.balance > 0
        ? new Decimal(inv.balance).div(targetQty)
        : new Decimal(0);
    const tradeDate =
      normalizeIsoDate(inv.purchaseDate) ??
      normalizeIsoDate(inv.issueDate) ??
      (sorted.length > 0 ? subtractOneDay(sorted[0].tradeDate) : null) ??
      normalizeIsoDate(inv.date) ??
      new Date().toISOString().slice(0, 10);
    return {
      averagePrice: null,
      totalInvested: null,
      costBasisSource: 'UNKNOWN',
      coveredByHistory: false,
      openingAdjustment: {
        quantity: remainingQty.toString(),
        totalCost: remainingQty.mul(unitPrice).toFixed(2),
        tradeDate,
      },
      closingAdjustment: null,
    };
  }

  const excessQty = qty.minus(targetQty);
  if (targetQty.gte(0) && excessQty.gt(new Decimal('0.0001')) && hasCostHistory && qty.gt(0)) {
    const bookAvg = totalCost.div(qty);
    const adjCost = excessQty.mul(bookAvg);
    const remainingCost = Decimal.max(0, totalCost.minus(adjCost));
    const tradeDate =
      sorted.length > 0
        ? addOneDay(sorted[sorted.length - 1].tradeDate)
        : normalizeIsoDate(inv.date) ?? new Date().toISOString().slice(0, 10);
    return {
      averagePrice: bookAvg.toFixed(8),
      totalInvested: remainingCost.toFixed(2),
      costBasisSource: 'TRANSACTIONS',
      coveredByHistory: false,
      openingAdjustment: null,
      closingAdjustment: {
        quantity: excessQty.toString(),
        totalCost: adjCost.toFixed(2),
        tradeDate,
      },
    };
  }

  return {
    averagePrice: null,
    totalInvested: null,
    costBasisSource: 'UNKNOWN',
    coveredByHistory: false,
    openingAdjustment: null,
    closingAdjustment: null,
  };
}

export function matchInvestmentToAsset(
  inv: PluggyInvestment,
  existingAssets: InvestmentMatchCandidate[],
  itemId?: string
): InvestmentMatchResult {
  // 0. External ID direto
  const byExt = existingAssets.find((a) => a.externalId && a.externalId === inv.id);
  if (byExt) {
    return { matchedAssetId: byExt.id, strategy: 'EXTERNAL_ID', confidence: 'HIGH' };
  }

  // R7: ignorar candidatos OPEN_FINANCE de outro item ou com external_id diferente
  const eligible = existingAssets.filter((a) => {
    if (a.source !== 'OPEN_FINANCE') return true;
    if (itemId && a.institutionId && a.institutionId !== itemId) return false;
    if (a.externalId && a.externalId !== inv.id) return false;
    return true;
  });

  // 1. ISIN
  const invIsin = (inv.isin || '').trim().toUpperCase();
  if (invIsin) {
    const byIsin = eligible.find(
      (a) => a.isin && a.isin.trim().toUpperCase() === invIsin
    );
    if (byIsin) {
      return { matchedAssetId: byIsin.id, strategy: 'ISIN', confidence: 'HIGH' };
    }
  }

  // 2. Ticker normalizado
  const invTicker = normalizeInvestmentTicker(inv.code);
  if (invTicker) {
    const byTicker = eligible.find(
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
    const { rfRate: invRate } = resolvePluggyFixedIncomeRates(inv);

    if (invIssuer && invDue && invRate !== null) {
      const byRf = eligible.find((a) => {
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

export interface MappedPluggyIncomeEvent {
  ticker: string;
  payDate: string;
  amount: string;
  kind: string;
  quantity: string | null;
  unitAmount: string | null;
  notes: string | null;
  externalId: string;
  source: 'OPEN_FINANCE';
}

export function classifyPluggyIncomeKind(
  description: string | null | undefined,
  investment: Pick<PluggyInvestment, 'type' | 'subtype'>
): string {
  const norm = (description || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (norm.includes('jcp') || norm.includes('juros sobre capital')) {
    return 'JCP';
  }
  if (norm.includes('dividend')) {
    return 'DIVIDENDO';
  }
  const { assetClass } = resolvePluggyAssetClass(investment as PluggyInvestment);
  if (norm.includes('rendimento') || assetClass === 'FII') {
    return 'RENDIMENTO';
  }
  return 'PROVENTO';
}

export function mapPluggyIncomeEvent(
  tx: PluggyInvestmentTransaction,
  investment: Pick<PluggyInvestment, 'id' | 'type' | 'subtype' | 'code' | 'name' | 'issuer' | 'dueDate' | 'rate' | 'rateType'>
): MappedPluggyIncomeEvent {
  const rawVal = tx.netAmount !== null && tx.netAmount !== undefined ? tx.netAmount : (tx.amount ?? 0);
  const amount = new Decimal(rawVal).abs().toFixed(2);
  const payDate = (tx.date || tx.tradeDate || '').slice(0, 10);
  const ticker =
    normalizeInvestmentTicker(investment.code) ||
    buildInvestmentDisplay(investment as PluggyInvestment).ticker;
  const quantity =
    tx.quantity !== null && tx.quantity !== undefined ? new Decimal(tx.quantity).toString() : null;
  const unitAmount =
    tx.value !== null && tx.value !== undefined ? new Decimal(tx.value).toFixed(2) : null;

  return {
    ticker,
    payDate,
    amount,
    kind: classifyPluggyIncomeKind(tx.description, investment),
    quantity,
    unitAmount,
    notes: tx.description ? tx.description.trim() : null,
    externalId: `pluggy:${tx.id}`,
    source: 'OPEN_FINANCE',
  };
}

export function formatMissingSinceLabel(missingSinceIso: string): string {
  const datePart = missingSinceIso.slice(0, 10);
  const [, month, day] = datePart.split('-');
  if (!month || !day) return 'não informado';
  return `não informado desde ${day}/${month}`;
}
