import Decimal from 'decimal.js';
import { AssetClass } from './types';

export interface ClassSummaryInput {
  assetClass: AssetClass;
  targetPercentage: number;
  currentValue: string | number;
  /** Coluna "Recebe aporte?" da planilha. */
  receivesContribution: boolean;
}

export interface ClassSummaryRow {
  assetClass: AssetClass;
  currentValue: string;
  currentPercent: string;
  targetPercent: string;
  targetValue: string;
  /** Positivo = falta; negativo = sobra. */
  gap: string;
  receivesContribution: boolean;
  /** Parcela do aporte do mês destinada à classe. */
  contributionShare: string;
}

export interface ClassSummary {
  rows: ClassSummaryRow[];
  totalValue: string;
  totalContribution: string;
}

/** Resumo por classe, equivalente à aba "Resumo" da planilha. */
export function buildClassSummary(
  classes: ClassSummaryInput[],
  monthlyContribution: string | number = 0
): ClassSummary {
  const contribution = new Decimal(monthlyContribution || 0);
  const total = classes.reduce((s, c) => s.plus(c.currentValue || 0), new Decimal(0));
  const receivingTargets = classes.reduce(
    (s, c) => (c.receivesContribution ? s.plus(c.targetPercentage || 0) : s),
    new Decimal(0)
  );

  const rows = classes.map((c) => {
    const current = new Decimal(c.currentValue || 0);
    const targetValue = total.mul(c.targetPercentage || 0).div(100);
    const share =
      c.receivesContribution && receivingTargets.gt(0)
        ? contribution.mul(c.targetPercentage || 0).div(receivingTargets)
        : new Decimal(0);
    return {
      assetClass: c.assetClass,
      currentValue: current.toFixed(2),
      currentPercent: total.isZero() ? '0.00' : current.div(total).mul(100).toFixed(2),
      targetPercent: new Decimal(c.targetPercentage || 0).toFixed(2),
      targetValue: targetValue.toFixed(2),
      gap: targetValue.minus(current).toFixed(2),
      receivesContribution: c.receivesContribution,
      contributionShare: share.toFixed(2),
    };
  });

  const totalContribution = rows.reduce((s, r) => s.plus(r.contributionShare), new Decimal(0));
  return { rows, totalValue: total.toFixed(2), totalContribution: totalContribution.toFixed(2) };
}
