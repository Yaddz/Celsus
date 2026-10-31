import Decimal from 'decimal.js';
import {
  AssetClass,
  ClassTarget,
  AssetTarget,
  GlobalTargetResult,
  ValidationResult,
} from './types';

/**
 * Calcula a meta global Ti de um ativo na carteira:
 * Ti = (Wc * wi,c) / 100
 */
export function calculateGlobalTarget(
  classTargetPercent: number,
  assetTargetInClass: number
): number {
  if (!classTargetPercent || !assetTargetInClass) {
    return 0;
  }
  return new Decimal(classTargetPercent)
    .mul(assetTargetInClass)
    .div(100)
    .toNumber();
}

/**
 * Valida se a soma das metas macro das classes totaliza exatamente 100%.
 */
export function validateClassTargets(
  targets: Array<{ assetClass: AssetClass; targetPercentage: number }>
): ValidationResult {
  const sum = targets.reduce(
    (acc, t) => acc.plus(t.targetPercentage || 0),
    new Decimal(0)
  );

  const sumNum = sum.toNumber();
  const isValid = sum.equals(100);

  return {
    isValid,
    sum: sumNum,
    error: isValid
      ? undefined
      : `A soma das metas macro das classes deve ser 100% (atual: ${sumNum}%)`,
  };
}

/**
 * Valida se a soma das metas micro dos ativos dentro de uma classe totaliza 100%.
 */
export function validateAssetTargetsInClass(
  assets: Array<{ targetPercentageInClass: number }>
): ValidationResult {
  const sum = assets.reduce(
    (acc, a) => acc.plus(a.targetPercentageInClass || 0),
    new Decimal(0)
  );

  const sumNum = sum.toNumber();
  const isValid = sum.equals(100);

  return {
    isValid,
    sum: sumNum,
    error: isValid
      ? undefined
      : `A soma das metas dos ativos na classe deve ser 100% (atual: ${sumNum}%)`,
  };
}

/**
 * Calcula a alocação global ideal Ti de cada ativo na carteira completa.
 */
export function calculatePortfolioGlobalTargets(
  classTargets: ClassTarget[],
  assets: AssetTarget[]
): GlobalTargetResult[] {
  const classTargetMap = new Map<AssetClass, number>();
  for (const ct of classTargets) {
    classTargetMap.set(ct.assetClass, ct.targetPercentage);
  }

  return assets.map((asset) => {
    const classPercent = classTargetMap.get(asset.assetClass) || 0;
    const globalTarget = calculateGlobalTarget(
      classPercent,
      asset.targetPercentageInClass
    );

    return {
      ticker: asset.ticker,
      assetClass: asset.assetClass,
      globalTargetPercentage: globalTarget,
    };
  });
}
