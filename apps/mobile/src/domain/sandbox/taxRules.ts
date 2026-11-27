export type SandboxTaxAssetClass =
  | 'STOCK'
  | 'FII'
  | 'ETF'
  | 'US_STOCK'
  | 'CRYPTO'
  | 'FX'
  | 'FIXED_INCOME'
  | 'POUPANCA'
  | 'FUNDS';

export interface TaxRuleSpec {
  rate: number;
  monthlySalesExemptionBRL: number | null;
  annualSalesExemptionUSD?: number | null;
  dividendWithholdingRate: number;
  description: string;
}

export interface TaxRulesVersion {
  validFrom: string;
  source: string;
  verifiedAt: string;
  rules: Record<SandboxTaxAssetClass, TaxRuleSpec>;
}

export interface TaxLegContext {
  assetClass: SandboxTaxAssetClass;
  gainBRL: number;
  saleAmountBRL: number;
  saleDate?: string;
  holdingDays?: number;
  fxAccountType?: 'cash' | 'non_remunerated_account';
  saleAmountUSD?: number;
}

export interface MonthlySalesContext {
  totalStockSalesInMonthBRL?: number;
  totalCryptoSalesInMonthBRL?: number;
  totalFxSalesInYearUSD?: number;
  taxEnabled?: boolean;
}

export interface TaxEstimateResult {
  taxBRL: number;
  effectiveRate: number;
  isExempt: boolean;
  reason: string;
  label: string;
  validFrom: string;
}

/**
 * R49 — Tabela de IR estimado versionada por `validFrom`.
 * Conferida em 2026-11-27 com gov.br/receitafederal e legislação federal vigente
 * (Lei 11.033/2004, Lei 8.981/1995, Lei 8.668/1993, Lei 11.196/2005, Lei 14.754/2023, IN RFB 2.180/2024).
 */
export const TAX_RULES_VERSIONS: TaxRulesVersion[] = [
  {
    validFrom: '2024-01-01',
    source: 'Receita Federal (gov.br/receitafederal) — Lei 14.754/2023, Lei 11.033/2004, Lei 11.196/2005',
    verifiedAt: '2026-11-27',
    rules: {
      STOCK: {
        rate: 0.15,
        monthlySalesExemptionBRL: 20000,
        dividendWithholdingRate: 0,
        description: 'Ação B3 (operação comum): 15% sobre o ganho; isento se vendas no mês ≤ R$ 20.000',
      },
      FII: {
        rate: 0.2,
        monthlySalesExemptionBRL: null,
        dividendWithholdingRate: 0,
        description: 'FII: 20% sobre o ganho na venda de cotas, sem isenção; rendimentos isentos para PF',
      },
      ETF: {
        rate: 0.15,
        monthlySalesExemptionBRL: null,
        dividendWithholdingRate: 0,
        description: 'ETF B3: 15% sobre o ganho, sem isenção',
      },
      US_STOCK: {
        rate: 0.15,
        monthlySalesExemptionBRL: null,
        dividendWithholdingRate: 0.3,
        description: 'Ação/ETF EUA (Lei 14.754/2023): 15% anual sobre o ganho em BRL; dividendos retidos 30% nos EUA',
      },
      CRYPTO: {
        rate: 0.15,
        monthlySalesExemptionBRL: 35000,
        dividendWithholdingRate: 0,
        description: 'Cripto (exchange nacional/autocustódia): 15% sobre o ganho; isento se vendas no mês ≤ R$ 35.000',
      },
      FX: {
        rate: 0.15,
        monthlySalesExemptionBRL: null,
        annualSalesExemptionUSD: 5000,
        dividendWithholdingRate: 0,
        description: 'Câmbio: espécie isenta até US$ 5.000/ano (15% acima); conta não remunerada no exterior isenta',
      },
      FIXED_INCOME: {
        rate: 0.225,
        monthlySalesExemptionBRL: null,
        dividendWithholdingRate: 0,
        description: 'Renda fixa / CDI: tabela regressiva 22,5% / 20% / 17,5% / 15%',
      },
      POUPANCA: {
        rate: 0,
        monthlySalesExemptionBRL: null,
        dividendWithholdingRate: 0,
        description: 'Poupança: isenta de IR para pessoa física',
      },
      FUNDS: {
        rate: 0.15,
        monthlySalesExemptionBRL: null,
        dividendWithholdingRate: 0,
        description: 'Fundos de investimento: alíquota estimada de 15% sobre o ganho',
      },
    },
  },
];

export function getTaxRulesVersion(asOfDate?: string): TaxRulesVersion {
  const ref = asOfDate || new Date().toISOString().slice(0, 10);
  let selected = TAX_RULES_VERSIONS[0];
  for (const ver of TAX_RULES_VERSIONS) {
    if (ver.validFrom <= ref && ver.validFrom >= selected.validFrom) {
      selected = ver;
    }
  }
  return selected;
}

/**
 * Retenção na fonte por tipo de provento:
 * - JCP em ativos B3: 15% na fonte
 * - US_STOCK: 30% na fonte
 * - Demais proventos B3: 0%
 */
export function getDividendWithholdingRate(
  assetClass: SandboxTaxAssetClass,
  dividendType?: string | null,
  referenceDate?: string
): number {
  const normalizedType = (dividendType ?? '').trim().toUpperCase();
  if (
    assetClass !== 'US_STOCK' &&
    (normalizedType === 'JCP' ||
      normalizedType === 'JSCP' ||
      normalizedType.includes('JUROS SOBRE CAPITAL'))
  ) {
    return 0.15;
  }
  return getTaxRulesVersion(referenceDate).rules[assetClass].dividendWithholdingRate;
}

/**
 * Tabela regressiva de renda fixa / CDI (RFB).
 */
export function regressiveFixedIncomeRate(holdingDays: number): number {
  if (holdingDays <= 180) return 0.225;
  if (holdingDays <= 360) return 0.2;
  if (holdingDays <= 720) return 0.175;
  return 0.15;
}

function formatBRLShort(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/**
 * R49: Estima o IR de uma operação no simulador, sempre rotulado como "estimativa".
 */
export function estimateTax(
  leg: TaxLegContext,
  monthlySalesContext: MonthlySalesContext = {}
): TaxEstimateResult {
  const version = getTaxRulesVersion(leg.saleDate);
  const validFrom = version.validFrom;

  if (monthlySalesContext.taxEnabled === false) {
    return {
      taxBRL: 0,
      effectiveRate: 0,
      isExempt: true,
      reason: 'IR desligado na simulação',
      label: 'Estimativa de IR desligada (R$ 0,00)',
      validFrom,
    };
  }

  if (!Number.isFinite(leg.gainBRL) || leg.gainBRL <= 0) {
    return {
      taxBRL: 0,
      effectiveRate: 0,
      isExempt: true,
      reason: 'Sem ganho tributável',
      label: 'Estimativa de IR: R$ 0,00 (sem ganho)',
      validFrom,
    };
  }

  const rule = version.rules[leg.assetClass];

  if (leg.assetClass === 'POUPANCA') {
    return {
      taxBRL: 0,
      effectiveRate: 0,
      isExempt: true,
      reason: 'Poupança isenta de IR',
      label: 'Estimativa de IR: R$ 0,00 (poupança isenta)',
      validFrom,
    };
  }

  if (leg.assetClass === 'STOCK') {
    const monthlySales = monthlySalesContext.totalStockSalesInMonthBRL ?? leg.saleAmountBRL;
    const limit = rule.monthlySalesExemptionBRL ?? 20000;
    if (monthlySales <= limit) {
      return {
        taxBRL: 0,
        effectiveRate: 0,
        isExempt: true,
        reason: 'Isento (vendas de ações no mês ≤ R$ 20.000)',
        label: 'Estimativa de IR: R$ 0,00 (isento ≤ R$ 20 mil/mês)',
        validFrom,
      };
    }
  }

  if (leg.assetClass === 'CRYPTO') {
    const monthlySales = monthlySalesContext.totalCryptoSalesInMonthBRL ?? leg.saleAmountBRL;
    const limit = rule.monthlySalesExemptionBRL ?? 35000;
    if (monthlySales <= limit) {
      return {
        taxBRL: 0,
        effectiveRate: 0,
        isExempt: true,
        reason: 'Isento (vendas de cripto no mês ≤ R$ 35.000)',
        label: 'Estimativa de IR: R$ 0,00 (isento ≤ R$ 35 mil/mês)',
        validFrom,
      };
    }
  }

  if (leg.assetClass === 'FX') {
    if (leg.fxAccountType === 'non_remunerated_account') {
      return {
        taxBRL: 0,
        effectiveRate: 0,
        isExempt: true,
        reason: 'Conta não remunerada no exterior isenta (Lei 14.754/2023)',
        label: 'Estimativa de IR: R$ 0,00 (conta não remunerada isenta)',
        validFrom,
      };
    }
    const annualUsdSales = monthlySalesContext.totalFxSalesInYearUSD ?? leg.saleAmountUSD ?? 0;
    const limitUsd = rule.annualSalesExemptionUSD ?? 5000;
    if (annualUsdSales <= limitUsd) {
      return {
        taxBRL: 0,
        effectiveRate: 0,
        isExempt: true,
        reason: 'Isento (alienação de moeda em espécie ≤ US$ 5.000/ano)',
        label: 'Estimativa de IR: R$ 0,00 (isento ≤ US$ 5.000/ano)',
        validFrom,
      };
    }
  }

  const rate =
    leg.assetClass === 'FIXED_INCOME'
      ? regressiveFixedIncomeRate(leg.holdingDays ?? 0)
      : rule.rate;

  const taxBRL = leg.gainBRL * rate;
  const pctLabel = `${(rate * 100).toFixed(rate * 100 % 1 === 0 ? 0 : 1).replace('.', ',')}%`;

  return {
    taxBRL,
    effectiveRate: rate,
    isExempt: false,
    reason: rule.description,
    label: `Estimativa de IR (${pctLabel}): ${formatBRLShort(taxBRL)}`,
    validFrom,
  };
}
