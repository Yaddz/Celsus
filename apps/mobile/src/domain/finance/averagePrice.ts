import Decimal from 'decimal.js';
import {
  BuyOperationParams,
  BuyOperationResult,
  SellOperationParams,
  SellOperationResult,
  PositionTransaction,
  PositionResult,
} from './types';

function getDecimalPlaces(value: string | number): number {
  const str = value.toString();
  const dotIndex = str.indexOf('.');
  return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
}

function formatQuantity(
  qty: Decimal,
  sampleInputs: Array<string | number>
): string {
  if (qty.isZero()) {
    return '0';
  }

  const maxDecimals = Math.max(...sampleInputs.map(getDecimalPlaces));
  if (maxDecimals >= 4) {
    return qty.toFixed(8);
  }
  if (maxDecimals === 0 && qty.isInteger()) {
    return qty.toFixed(0);
  }
  return qty.decimalPlaces() <= 2 ? qty.toFixed(2) : qty.toString();
}

function formatCurrency(val: Decimal): string {
  if (val.decimalPlaces() <= 2) {
    return val.toFixed(2);
  }
  return val.toString();
}

/**
 * Calcula o novo Preço Médio e quantidade após uma compra (BUY) com taxas:
 * Custo Total Novo = (Q_ant * PM_ant) + (Q_compra * P_compra) + Taxas
 * Q_nova = Q_ant + Q_compra
 * PM_novo = Custo Total Novo / Q_nova
 */
export function calculateBuyOperation(
  params: BuyOperationParams
): BuyOperationResult {
  const currentQty = new Decimal(params.currentQuantity || 0);
  const currentPM = new Decimal(params.currentAveragePrice || 0);
  const buyQty = new Decimal(params.buyQuantity);
  const buyPrice = new Decimal(params.buyPrice);
  const fees = new Decimal(params.fees || 0);

  // Arredonda o custo prévio para até 4 casas decimais para evitar resíduos ao recombinar frações de cripto
  const prevCost = currentQty.mul(currentPM).toDecimalPlaces(4);
  const buyCost = buyQty.mul(buyPrice).plus(fees).toDecimalPlaces(4);
  const totalCost = prevCost.plus(buyCost).toDecimalPlaces(4);
  const newQty = currentQty.plus(buyQty);

  const newPM = newQty.isZero() ? new Decimal(0) : totalCost.div(newQty);

  return {
    quantity: formatQuantity(newQty, [
      params.currentQuantity,
      params.buyQuantity,
    ]),
    averagePrice: newPM.toFixed(2),
    totalCost: formatCurrency(totalCost),
  };
}

/**
 * Calcula o resultado de uma venda parcial ou total (SELL):
 * PM permanece inalterado.
 * Q_nova = Q_ant - Q_venda
 * Resultado Realizado = (Q_venda * P_venda - Taxas) - (Q_venda * PM_ant)
 * Se Q_nova == 0, PM_novo = 0.00.
 */
export function calculateSellOperation(
  params: SellOperationParams
): SellOperationResult {
  const currentQty = new Decimal(params.currentQuantity || 0);
  const currentPM = new Decimal(params.currentAveragePrice || 0);
  const sellQty = new Decimal(params.sellQuantity);
  const sellPrice = new Decimal(params.sellPrice);
  const fees = new Decimal(params.fees || 0);

  if (sellQty.gt(currentQty)) {
    throw new Error(
      `Saldo insuficiente para venda: quantidade atual é ${currentQty.toString()}, mas tentou vender ${sellQty.toString()}`
    );
  }

  const newQty = currentQty.minus(sellQty);
  const netSellAmount = sellQty.mul(sellPrice).minus(fees);
  const costOfSoldShares = sellQty.mul(currentPM);
  const realizedPnl = netSellAmount.minus(costOfSoldShares);

  const newPM = newQty.isZero() ? new Decimal(0) : currentPM;

  return {
    quantity: formatQuantity(newQty, [
      params.currentQuantity,
      params.sellQuantity,
    ]),
    averagePrice: newPM.toFixed(2),
    realizedPnl: formatCurrency(realizedPnl),
  };
}

/**
 * Recalcula a posição consolidada (Q, PM, Custo Total, Lucro Realizado)
 * a partir do histórico completo de transações do ativo.
 */
export function calculatePositionFromTransactions(
  transactions: PositionTransaction[]
): PositionResult {
  let currentQty = new Decimal(0);
  let currentPM = new Decimal(0);
  let totalRealizedPnl = new Decimal(0);
  let sampleInputs: Array<string | number> = [];

  for (const tx of transactions) {
    sampleInputs.push(tx.quantity);
    if (tx.type === 'BUY') {
      const buyRes = calculateBuyOperation({
        currentQuantity: currentQty.toString(),
        currentAveragePrice: currentPM.toString(),
        buyQuantity: tx.quantity,
        buyPrice: tx.unitPrice,
        fees: tx.fees,
      });
      currentQty = new Decimal(buyRes.quantity);
      currentPM = new Decimal(buyRes.averagePrice);
    } else if (tx.type === 'SELL') {
      const sellRes = calculateSellOperation({
        currentQuantity: currentQty.toString(),
        currentAveragePrice: currentPM.toString(),
        sellQuantity: tx.quantity,
        sellPrice: tx.unitPrice,
        fees: tx.fees,
      });
      currentQty = new Decimal(sellRes.quantity);
      currentPM = new Decimal(sellRes.averagePrice);
      totalRealizedPnl = totalRealizedPnl.plus(new Decimal(sellRes.realizedPnl));
    }
  }

  const totalInvested = currentQty.mul(currentPM);

  return {
    quantity: formatQuantity(currentQty, sampleInputs),
    averagePrice: currentPM.toFixed(2),
    totalInvested: formatCurrency(totalInvested),
    realizedPnl: formatCurrency(totalRealizedPnl),
  };
}
