import { AssetClass } from '../../components/ui/AttributeStatBar';

export interface PricePoint {
  date: string;
  close: number;
}

export interface Dividend {
  date: string; // YYYY-MM-DD
  type: string; // 'DIVIDEND' | 'JCP' | 'RENDIMENTO'
  amount: number; // R$ per share
  notes?: string;
}

export interface AssetAbout {
  companyName?: string;
  sector?: string;
  listingSegment?: string;
  sharesOutstanding?: number | string;
  website?: string;
}

export interface AssetProfile {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change24h: number;
  change12m?: number;
  indicators: Record<string, string | number | null | undefined>;
  about?: AssetAbout;
  source?: string;
  isStale?: boolean;
  updatedAt?: string;
}

export interface DividendSummary {
  total12m: number;
  frequency: string;
  last6: Array<Dividend & { isHighest?: boolean }>;
  recent: Dividend[];
}

export interface RankingItem {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  dy12m: number | null;
  pvp: number | null;
  change24h: number;
}

export interface IndicatorDefinition {
  key: string;
  label: string;
  tooltip: string;
  format: (value: any) => string;
}

export function periodReturn(_points: PricePoint[]): number {
  return 0;
}

export function dividendYield12m(_dividends: Dividend[], _currentPrice: number, _nowDate?: string): number {
  return 0;
}

export function summarizeDividends(_dividends: Dividend[], _currentPrice: number, _nowDate?: string): DividendSummary {
  return {
    total12m: 0,
    frequency: '—',
    last6: [],
    recent: [],
  };
}

export function rankAssets(
  _items: RankingItem[],
  _by: 'dy' | 'pvp' | 'change' | 'price' | 'ticker',
  _dir: 'asc' | 'desc'
): RankingItem[] {
  return [];
}

export function indicatorsFor(_assetClass: AssetClass): IndicatorDefinition[] {
  return [];
}

export function formatIndicatorValue(_key: string, _value: any): string {
  return '—';
}
