import Decimal from 'decimal.js';
import { FixedIncomeParams, FixedIncomeResult } from './types';

/**
 * Capitalização composta diária pós-fixada (% do CDI):
 * Fator = Produtório(1 + CDI_diario * Taxa / 100)
 */
export function calculateCDIAccrual(
  principal: string | number,
  ratePercentOfCDI: number,
  dailyCDIRates: number[]
): { factor: string; currentValue: string } {
  const p = new Decimal(principal);
  if (!dailyCDIRates || dailyCDIRates.length === 0) {
    return {
      factor: '1.000000',
      currentValue: p.toFixed(2),
    };
  }

  const rateMultiplier = new Decimal(ratePercentOfCDI).div(100);
  let factor = new Decimal(1);

  for (const dailyCDI of dailyCDIRates) {
    const dailyRate = new Decimal(dailyCDI).mul(rateMultiplier);
    const dayFactor = new Decimal(1).plus(dailyRate);
    factor = factor.mul(dayFactor);
  }

  const currentValue = p.mul(factor);

  return {
    factor: factor.toString(),
    currentValue: currentValue.toFixed(2),
  };
}

/**
 * Capitalização Pré-fixada em dias úteis (base 252):
 * Fator = (1 + Taxa / 100) ^ (DU / 252)
 */
export function calculatePreFixedAccrual(
  principal: string | number,
  annualRatePercent: number,
  businessDays: number
): { factor: string; currentValue: string } {
  const p = new Decimal(principal);
  const base = new Decimal(1).plus(new Decimal(annualRatePercent).div(100));
  const exponent = new Decimal(businessDays).div(252);
  const factor = base.pow(exponent);
  const currentValue = p.mul(factor);

  // If exact annual factor without fractional exponent
  const factorStr = factor.decimalPlaces() <= 6 ? factor.toFixed(6) : factor.toString();

  return {
    factor: factorStr,
    currentValue: currentValue.toFixed(2),
  };
}

/**
 * Capitalização Híbrida IPCA + Taxa Pré-fixada (base 252):
 * Fator = (1 + IPCA_acumulado) * (1 + Taxa / 100) ^ (DU / 252)
 */
export function calculateIPCAPlusAccrual(
  principal: string | number,
  annualFixedRate: number,
  businessDays: number,
  accumulatedIPCAVariation: number
): { factor: string; currentValue: string } {
  const p = new Decimal(principal);
  const fixedBase = new Decimal(1).plus(new Decimal(annualFixedRate).div(100));
  const exponent = new Decimal(businessDays).div(252);
  const fixedFactor = fixedBase.pow(exponent);
  const ipcaFactor = new Decimal(1).plus(accumulatedIPCAVariation);
  const totalFactor = ipcaFactor.mul(fixedFactor);
  const currentValue = p.mul(totalFactor);

  return {
    factor: totalFactor.toString(),
    currentValue: currentValue.toFixed(2),
  };
}

/**
 * Precificação consolidada de Renda Fixa:
 * Verifica precedência de manual_price_override antes de computar curva teórica.
 */
export function calculateFixedIncomeCurrentValue(
  params: FixedIncomeParams
): FixedIncomeResult {
  const p = new Decimal(params.principal);

  if (
    params.manualPriceOverride !== null &&
    params.manualPriceOverride !== undefined &&
    params.manualPriceOverride !== ''
  ) {
    const overrideVal = new Decimal(params.manualPriceOverride);
    const factor = p.isZero() ? new Decimal(1) : overrideVal.div(p);
    return {
      factor: factor.toFixed(6),
      currentValue: overrideVal.toFixed(2),
      isOverridden: true,
    };
  }

  if (params.indexer === 'CDI') {
    const res = calculateCDIAccrual(
      params.principal,
      params.rate,
      params.dailyCDIRates || []
    );
    return {
      ...res,
      isOverridden: false,
    };
  }

  if (params.indexer === 'PRE') {
    const res = calculatePreFixedAccrual(
      params.principal,
      params.rate,
      params.businessDays || 0
    );
    return {
      ...res,
      isOverridden: false,
    };
  }

  if (params.indexer === 'IPCA') {
    const res = calculateIPCAPlusAccrual(
      params.principal,
      params.rate,
      params.businessDays || 0,
      params.accumulatedIPCAVariation || 0
    );
    return {
      ...res,
      isOverridden: false,
    };
  }

  return {
    factor: '1.000000',
    currentValue: p.toFixed(2),
    isOverridden: false,
  };
}
