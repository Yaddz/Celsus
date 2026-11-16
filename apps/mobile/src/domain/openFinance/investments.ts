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

export function normalizeInvestmentTicker(_ticker: string | null | undefined): string {
  throw new Error('Not implemented: normalizeInvestmentTicker');
}

export function formatNullableOpenFinanceMetric(
  _value: number | null | undefined,
  _suffix?: string
): string {
  throw new Error('Not implemented: formatNullableOpenFinanceMetric');
}

export function mapPluggyInvestment(_inv: PluggyInvestment): MappedPluggyInvestment {
  throw new Error('Not implemented: mapPluggyInvestment');
}

export function mapPluggyInvestmentTransaction(
  _tx: PluggyInvestmentTransaction,
  _investmentId?: string
): MappedPluggyInvestmentTransaction {
  throw new Error('Not implemented: mapPluggyInvestmentTransaction');
}

export function calculateInvestmentCostBasis(
  _inv: PluggyInvestment,
  _txs: MappedPluggyInvestmentTransaction[]
): InvestmentCostBasisResult {
  throw new Error('Not implemented: calculateInvestmentCostBasis');
}

export function matchInvestmentToAsset(
  _inv: PluggyInvestment,
  _existingAssets: InvestmentMatchCandidate[]
): InvestmentMatchResult {
  throw new Error('Not implemented: matchInvestmentToAsset');
}

export function computeClassCoverageReport(
  _investments: PluggyInvestment[]
): ClassCoverageStatus[] {
  throw new Error('Not implemented: computeClassCoverageReport');
}

export function formatMissingSinceLabel(_missingSinceIso: string): string {
  throw new Error('Not implemented: formatMissingSinceLabel');
}
