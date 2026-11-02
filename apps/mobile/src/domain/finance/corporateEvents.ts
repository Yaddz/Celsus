import { SplitRatio } from './types';

export interface SplitAdjustmentParams {
  currentQuantity: string | number;
  currentAveragePrice: string | number;
  splitRatio: SplitRatio;
}

export interface SplitAdjustmentResult {
  quantity: string;
  averagePrice: string;
  totalCost: string;
}

export interface CorporateEventItem {
  id?: string;
  ticker: string;
  type?: 'SPLIT' | 'INPLIT' | 'DIVIDEND';
  event_type?: string;
  eventType?: 'SPLIT' | 'INPLIT' | 'DIVIDEND';
  eventDate?: string;
  event_date?: string;
  numerator: number;
  denominator: number;
  ratio?: number;
  cashAmount?: number;
  cash_amount?: number;
}

export interface ReconciledEvent {
  externalId: string;
  ticker: string;
  type: 'SPLIT' | 'INPLIT';
  eventDate: string;
  splitRatio: SplitRatio;
  quantityBefore: string;
  quantityAfter: string;
  averagePriceBefore: string;
  averagePriceAfter: string;
}

export interface ReconcileCorporateEventsParams {
  ticker: string;
  assetId?: string;
  portfolioId?: string;
  currentQuantity: string | number;
  currentAveragePrice: string | number;
  events: CorporateEventItem[];
  existingTransactionExternalIds?: string[];
}

export interface ReconcileCorporateEventsResult {
  appliedEvents: ReconciledEvent[];
  finalQuantity: string;
  finalAveragePrice: string;
}

/**
 * Calcula o novo Preço Médio e Quantidade após um evento de Split ou Inplit:
 * Q_nova = Q_ant * (numerator / denominator)
 * PM_novo = PM_ant * (denominator / numerator)
 * Invariante: Custo Total de Aquisição (Q * PM) permanece estritamente constante.
 */
export function calculateSplitAdjustment(
  _params: SplitAdjustmentParams
): SplitAdjustmentResult {
  throw new Error('calculateSplitAdjustment not implemented');
}

/**
 * Reconcilia eventos corporativos de Split/Inplit de forma idempotente,
 * ignorando eventos cujo external_id já foi aplicado anteriormente.
 */
export function reconcileCorporateEvents(
  _params: ReconcileCorporateEventsParams
): ReconcileCorporateEventsResult {
  throw new Error('reconcileCorporateEvents not implemented');
}
