import Decimal from 'decimal.js';
import {
  RebalanceAssetInput,
  RebalanceAssetSuggestion,
  RebalanceResult,
} from './types';

/**
 * Calculadora Inteligente de Novo Aporte:
 * Di = max(0, V_meta_i - V_atual_i)
 * Sugere alocações sem recomendar venda de nenhum ativo.
 * Converte cotas inteiras para Ações/FIIs, frações de até 8 casas para Cripto,
 * e valor monetário direto para Renda Fixa.
 */
export function calculateSmartContribution(
  contributionAmount: string | number,
  assets: RebalanceAssetInput[]
): RebalanceResult {
  const contribution = new Decimal(contributionAmount || 0);

  // 1. Calcula o patrimônio atual de cada ativo e o total da carteira
  let portfolioCurrentVal = new Decimal(0);
  const assetCurrentValues: Decimal[] = [];

  for (const asset of assets) {
    let currVal: Decimal;
    if (asset.currentValue !== undefined && asset.currentValue !== null) {
      currVal = new Decimal(asset.currentValue);
    } else {
      const q = new Decimal(asset.currentQuantity || 0);
      const p = new Decimal(asset.currentPrice || 0);
      currVal = q.mul(p);
    }
    assetCurrentValues.push(currVal);
    portfolioCurrentVal = portfolioCurrentVal.plus(currVal);
  }

  // 2. Patrimônio projetado pós-aporte: V_final = V_atual + A
  const projectedTotal = portfolioCurrentVal.plus(contribution);

  // 3. Valor ideal pós-aporte e déficit positivo Di = max(0, V_meta - V_atual)
  const targetValues: Decimal[] = [];
  const deficits: Decimal[] = [];
  let totalDeficit = new Decimal(0);

  for (let i = 0; i < assets.length; i++) {
    const targetPercentage = new Decimal(assets[i].globalTargetPercentage || 0);
    const targetVal = projectedTotal.mul(targetPercentage).div(100);
    targetValues.push(targetVal);

    const diff = targetVal.minus(assetCurrentValues[i]);
    const deficit = Decimal.max(0, diff);
    deficits.push(deficit);
    totalDeficit = totalDeficit.plus(deficit);
  }

  // 4. Rateio proporcional do aporte e conversão em quantidade sugerida
  const suggestions: RebalanceAssetSuggestion[] = [];
  let totalAllocated = new Decimal(0);

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const currVal = assetCurrentValues[i];
    const targetVal = targetValues[i];
    const deficit = deficits[i];

    let deltaA = new Decimal(0);
    if (totalDeficit.gt(0) && deficit.gt(0)) {
      deltaA = contribution.mul(deficit).div(totalDeficit);
    }

    const price = new Decimal(asset.currentPrice || 0);
    let suggestedQtyStr: string;
    let allocatedAmountDec: Decimal;

    if (asset.assetClass === 'STOCK' || asset.assetClass === 'FII') {
      // Arredonda para número inteiro de cotas: floor(deltaA / price)
      if (price.gt(0)) {
        const wholeShares = deltaA.div(price).floor();
        suggestedQtyStr = wholeShares.toFixed(0);
        allocatedAmountDec = wholeShares.mul(price);
      } else {
        suggestedQtyStr = '0';
        allocatedAmountDec = new Decimal(0);
      }
    } else if (asset.assetClass === 'CRYPTO') {
      // Frações de até 8 casas decimais
      if (price.gt(0)) {
        const fraction = deltaA.div(price);
        suggestedQtyStr = fraction.toFixed(8);
        allocatedAmountDec = deltaA;
      } else {
        suggestedQtyStr = '0.00000000';
        allocatedAmountDec = new Decimal(0);
      }
    } else {
      // FIXED_INCOME: valor monetário exato
      suggestedQtyStr = deltaA.toFixed(2);
      allocatedAmountDec = deltaA;
    }

    totalAllocated = totalAllocated.plus(allocatedAmountDec);

    const currentWeight = portfolioCurrentVal.isZero()
      ? new Decimal(0)
      : currVal.div(portfolioCurrentVal).mul(100);

    suggestions.push({
      ticker: asset.ticker,
      assetClass: asset.assetClass,
      currentQuantity: new Decimal(asset.currentQuantity || 0).toString(),
      currentPrice: price.toFixed(2),
      currentValue: currVal.toFixed(2),
      currentWeightPercent: currentWeight.toFixed(2),
      targetWeightPercent: new Decimal(asset.globalTargetPercentage || 0).toFixed(2),
      targetValue: targetVal.toFixed(2),
      deficit: deficit.toFixed(2),
      suggestedAmount: deltaA.toFixed(2),
      suggestedQuantity: suggestedQtyStr,
      allocatedAmount: allocatedAmountDec.toFixed(2),
    });
  }

  const remainingCash = contribution.minus(totalAllocated);

  return {
    portfolioCurrentValue: portfolioCurrentVal.toFixed(2),
    contributionAmount: contribution.toFixed(2),
    projectedTotalValue: projectedTotal.toFixed(2),
    suggestions,
    totalAllocated: totalAllocated.toFixed(2),
    remainingCash: remainingCash.toFixed(2),
  };
}
