import Decimal from 'decimal.js';
import { AssetClass, RebalanceResult } from './types';

export interface ContributionAssetInput {
  ticker: string;
  assetClass: AssetClass;
  price: string | number;
  currentValue: string | number;
  /** Meta do ativo dentro da classe (%), "Meta na classe" da planilha. */
  targetInClassPercent: number;
}

export interface ContributionClassInput {
  assetClass: AssetClass;
  targetPercentage: number;
  receivesContribution: boolean;
}

export interface ContributionPlanItem {
  ticker: string;
  assetClass: AssetClass;
  price: string;
  currentValue: string;
  targetValueAfter: string;
  deficit: string;
  allocation: string;
  baseQuantity: string;
  extraShare: boolean;
  quantity: string;
  cost: string;
  percentInClassAfter: string;
}

export interface ContributionPlan {
  items: ContributionPlanItem[];
  classShares: Record<string, string>;
  totalSpent: string;
  /** "Troco" que não coube em nenhuma cota. */
  change: string;
}

const WHOLE_UNIT: AssetClass[] = ['STOCK', 'FII'];
const NO_GAP = new Decimal(-1_000_000_000);

/**
 * Aporte em duas fases (aba "Aporte" da planilha):
 * 1) rateia o aporte entre classes que recebem e, na classe, pelo déficit de cada ativo (cotas inteiras);
 * 2) distribui o troco: ativos ordenados pelo maior gap restante ganham 1 cota extra enquanto o troco cobrir o preço.
 */
export function calculateTwoPhaseContribution(
  contributionAmount: string | number,
  classes: ContributionClassInput[],
  assets: ContributionAssetInput[]
): ContributionPlan {
  const contribution = new Decimal(contributionAmount || 0);
  const receivingTargets = classes.reduce(
    (s, c) => (c.receivesContribution ? s.plus(c.targetPercentage || 0) : s),
    new Decimal(0)
  );
  const classShare = new Map<AssetClass, Decimal>();
  for (const c of classes) {
    classShare.set(
      c.assetClass,
      c.receivesContribution && receivingTargets.gt(0)
        ? contribution.mul(c.targetPercentage || 0).div(receivingTargets)
        : new Decimal(0)
    );
  }

  const classCurrent = new Map<AssetClass, Decimal>();
  for (const a of assets) {
    classCurrent.set(a.assetClass, (classCurrent.get(a.assetClass) ?? new Decimal(0)).plus(a.currentValue || 0));
  }

  // Fase 1: alvo pós-aporte e déficit por ativo
  const rows = assets.map((a) => {
    const share = classShare.get(a.assetClass) ?? new Decimal(0);
    const current = new Decimal(a.currentValue || 0);
    const targetAfter = new Decimal(a.targetInClassPercent || 0)
      .div(100)
      .mul((classCurrent.get(a.assetClass) ?? new Decimal(0)).plus(share));
    return { a, share, current, targetAfter, deficit: Decimal.max(0, targetAfter.minus(current)) };
  });
  const classDeficit = new Map<AssetClass, Decimal>();
  for (const r of rows) {
    classDeficit.set(r.a.assetClass, (classDeficit.get(r.a.assetClass) ?? new Decimal(0)).plus(r.deficit));
  }

  const calc = rows.map((r) => {
    const price = new Decimal(r.a.price || 0);
    const defSum = classDeficit.get(r.a.assetClass) ?? new Decimal(0);
    const allocation = defSum.gt(0) ? r.share.mul(r.deficit).div(defSum) : new Decimal(0);
    const whole = WHOLE_UNIT.includes(r.a.assetClass);
    let baseQty: Decimal;
    let cost: Decimal;
    if (whole) {
      baseQty = price.gt(0) ? allocation.div(price).floor() : new Decimal(0);
      cost = baseQty.mul(price);
    } else if (r.a.assetClass === 'CRYPTO') {
      baseQty = price.gt(0) ? allocation.div(price).toDecimalPlaces(8, Decimal.ROUND_DOWN) : new Decimal(0);
      cost = baseQty.mul(price);
    } else {
      baseQty = allocation; // renda fixa: valor monetário
      cost = allocation;
    }
    const gap = r.share.gt(0) ? r.targetAfter.minus(r.current).minus(cost) : NO_GAP;
    return { ...r, price, allocation, whole, baseQty, cost, gap, extra: false };
  });

  // Fase 2: troco
  const spent1 = calc.reduce((s, c) => s.plus(c.cost), new Decimal(0));
  let change = contribution.minus(spent1);
  const order = calc.map((c, i) => i).sort((x, y) => {
    const d = calc[y].gap.comparedTo(calc[x].gap);
    return d !== 0 ? d : x - y;
  });
  for (const i of order) {
    const c = calc[i];
    if (c.whole && c.share.gt(0) && c.price.gt(0) && change.gte(c.price)) {
      c.extra = true;
      change = change.minus(c.price);
    }
  }

  const classAfter = new Map<AssetClass, Decimal>();
  for (const c of calc) {
    const after = c.current.plus(c.cost).plus(c.extra ? c.price : 0);
    classAfter.set(c.a.assetClass, (classAfter.get(c.a.assetClass) ?? new Decimal(0)).plus(after));
  }

  const items: ContributionPlanItem[] = calc.map((c) => {
    const extraCost = c.extra ? c.price : new Decimal(0);
    const totalCost = c.cost.plus(extraCost);
    const qty = c.whole || c.a.assetClass === 'CRYPTO' ? c.baseQty.plus(c.extra ? 1 : 0) : c.baseQty;
    const after = c.current.plus(totalCost);
    const classTotal = classAfter.get(c.a.assetClass) ?? new Decimal(0);
    return {
      ticker: c.a.ticker,
      assetClass: c.a.assetClass,
      price: c.price.toFixed(2),
      currentValue: c.current.toFixed(2),
      targetValueAfter: c.targetAfter.toFixed(2),
      deficit: c.deficit.toFixed(2),
      allocation: c.allocation.toFixed(2),
      baseQuantity: c.a.assetClass === 'CRYPTO' ? c.baseQty.toFixed(8) : c.baseQty.toFixed(c.whole ? 0 : 2),
      extraShare: c.extra,
      quantity: c.a.assetClass === 'CRYPTO' ? qty.toFixed(8) : qty.toFixed(c.whole ? 0 : 2),
      cost: totalCost.toFixed(2),
      percentInClassAfter: classTotal.isZero() ? '0.00' : after.div(classTotal).mul(100).toFixed(2),
    };
  });

  const totalSpent = items.reduce((s, i) => s.plus(i.cost), new Decimal(0));
  const shares: Record<string, string> = {};
  classShare.forEach((v, k) => (shares[k] = v.toFixed(2)));
  return { items, classShares: shares, totalSpent: totalSpent.toFixed(2), change: contribution.minus(totalSpent).toFixed(2) };
}

/**
 * Adapta o plano em 2 fases ao formato `RebalanceResult` (usado pela execução em lote
 * e pela lista do Simulador). `extraShare` indica a cota extra vinda do troco.
 */
export function planToRebalanceResult(
  plan: ContributionPlan,
  contributionAmount: string | number,
  portfolioCurrentValue: string | number
): RebalanceResult & { extraShareTickers: string[] } {
  const contribution = new Decimal(contributionAmount || 0);
  const current = new Decimal(portfolioCurrentValue || 0);
  return {
    portfolioCurrentValue: current.toFixed(2),
    contributionAmount: contribution.toFixed(2),
    projectedTotalValue: current.plus(contribution).toFixed(2),
    suggestions: plan.items.map((i) => ({
      ticker: i.ticker,
      assetClass: i.assetClass,
      currentQuantity: '0',
      currentPrice: i.price,
      currentValue: i.currentValue,
      currentWeightPercent: '0.00',
      targetWeightPercent: i.percentInClassAfter,
      targetValue: i.targetValueAfter,
      deficit: i.deficit,
      suggestedAmount: i.allocation,
      suggestedQuantity: i.quantity,
      allocatedAmount: i.cost,
    })),
    totalAllocated: plan.totalSpent,
    remainingCash: plan.change,
    extraShareTickers: plan.items.filter((i) => i.extraShare).map((i) => i.ticker),
  };
}
