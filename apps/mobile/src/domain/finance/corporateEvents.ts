import Decimal from 'decimal.js';
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
  params: SplitAdjustmentParams
): SplitAdjustmentResult {
  if (
    !params.splitRatio ||
    params.splitRatio.numerator <= 0 ||
    params.splitRatio.denominator <= 0
  ) {
    throw new Error(
      'Proporção de split inválida: numerador e denominador devem ser maiores que zero'
    );
  }

  const currentQty = new Decimal(params.currentQuantity || 0);
  const currentPM = new Decimal(params.currentAveragePrice || 0);
  const num = new Decimal(params.splitRatio.numerator);
  const den = new Decimal(params.splitRatio.denominator);

  const ratio = num.div(den);
  const newQty = currentQty.mul(ratio);
  const newPM = ratio.isZero() ? new Decimal(0) : currentPM.div(ratio);
  const totalCost = currentQty.mul(currentPM);

  let formattedQty: string;
  if (newQty.isInteger()) {
    formattedQty = newQty.toFixed(0);
  } else if (newQty.decimalPlaces() <= 2) {
    formattedQty = newQty.toFixed(2);
  } else {
    formattedQty = newQty.toFixed(8);
  }

  return {
    quantity: formattedQty,
    averagePrice: newPM.toFixed(2),
    totalCost: totalCost.toFixed(2),
  };
}

/**
 * Reconcilia eventos corporativos de Split/Inplit de forma idempotente,
 * ignorando eventos cujo external_id já foi aplicado anteriormente.
 */
export function reconcileCorporateEvents(
  params: ReconcileCorporateEventsParams
): ReconcileCorporateEventsResult {
  const existingSet = new Set(params.existingTransactionExternalIds || []);
  let currentQ = params.currentQuantity ? params.currentQuantity.toString() : '0';
  let currentP = params.currentAveragePrice ? params.currentAveragePrice.toString() : '0.00';
  const appliedEvents: ReconciledEvent[] = [];

  for (const e of params.events || []) {
    const typeStr = (e.type || e.eventType || e.event_type || '').toUpperCase();
    if (typeStr === 'DIVIDEND') {
      continue;
    }

    const num = e.numerator ?? 0;
    const den = e.denominator ?? 0;
    if (num <= 0 || den <= 0) {
      continue;
    }

    const eventType: 'SPLIT' | 'INPLIT' =
      typeStr === 'SPLIT' || typeStr === 'INPLIT'
        ? (typeStr as 'SPLIT' | 'INPLIT')
        : num > den
        ? 'SPLIT'
        : 'INPLIT';

    const tickerStr = (params.ticker || e.ticker || '').toUpperCase();
    const dateStr = e.eventDate || e.event_date || '';

    const externalId = `YAHOO_${eventType}_${tickerStr}_${dateStr}_${num}:${den}`;

    if (existingSet.has(externalId)) {
      continue;
    }

    const prevQ = currentQ;
    const prevP = currentP;

    const adj = calculateSplitAdjustment({
      currentQuantity: currentQ,
      currentAveragePrice: currentP,
      splitRatio: {
        numerator: num,
        denominator: den,
      },
    });

    currentQ = adj.quantity;
    currentP = adj.averagePrice;
    existingSet.add(externalId);

    appliedEvents.push({
      externalId,
      ticker: tickerStr,
      type: eventType,
      eventDate: dateStr,
      splitRatio: {
        numerator: num,
        denominator: den,
      },
      quantityBefore: prevQ,
      quantityAfter: adj.quantity,
      averagePriceBefore: prevP,
      averagePriceAfter: adj.averagePrice,
    });
  }

  return {
    appliedEvents,
    finalQuantity: currentQ,
    finalAveragePrice: currentP,
  };
}
