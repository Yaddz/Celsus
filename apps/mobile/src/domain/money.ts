import Decimal from 'decimal.js';
import { formatUnitPriceBRL } from '../utils/formatters';

export type Currency = 'BRL' | 'USD';

export interface Money {
  amount: Decimal;
  currency: Currency;
}

export interface ConvertedMoney {
  money: Money;
  rate: Decimal;
  rateDate: string;
}

/**
 * Converte centavos inteiros (módulo Finanças) para Decimal em unidade monetária.
 */
export function centsToDecimal(cents: number): Decimal {
  return new Decimal(cents).div(100);
}

/**
 * Converte um valor decimal para centavos inteiros usando ROUND_HALF_UP
 * (mesmo arredondamento de `toCentsDecimal`, sem erros de ponto flutuante).
 */
export function decimalToCents(value: Decimal.Value): number {
  const res = new Decimal(value)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  return Object.is(res, -0) ? 0 : res;
}

export function money(amount: Decimal.Value, currency: Currency = 'BRL'): Money {
  return { amount: new Decimal(amount), currency };
}

/**
 * Soma dois valores `Money`. Lança erro se as moedas forem diferentes
 * (exige conversão explícita via `convert()`).
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(
      `Não é possível somar Money em ${a.currency} e ${b.currency} sem convert()`
    );
  }
  return {
    amount: a.amount.plus(b.amount),
    currency: a.currency,
  };
}

/**
 * Converte um `Money` usando taxa explícita (ex.: USD/BRL) e preserva taxa e data.
 * Arredonda o valor convertido para 2 casas decimais (ROUND_HALF_UP).
 */
export function convert(
  m: Money,
  rate: Decimal.Value,
  rateDate: string,
  targetCurrency?: Currency
): ConvertedMoney {
  const rateDec = new Decimal(rate);
  if (!rateDec.isFinite() || rateDec.lte(0)) {
    throw new Error('Taxa de câmbio inválida para conversão');
  }
  const target: Currency = targetCurrency ?? (m.currency === 'USD' ? 'BRL' : 'USD');
  if (target === m.currency) {
    return {
      money: { amount: m.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), currency: target },
      rate: new Decimal(1),
      rateDate,
    };
  }
  const convertedAmount =
    m.currency === 'USD' && target === 'BRL'
      ? m.amount.mul(rateDec)
      : m.amount.div(rateDec);
  return {
    money: {
      amount: convertedAmount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      currency: target,
    },
    rate: rateDec,
    rateDate,
  };
}

/**
 * Formata valor em BRL delegando para `utils/formatters.ts` quando unitário,
 * ou formatando em 2 casas decimais para valores monetários.
 */
export function formatBRL(value: Money | Decimal.Value, isPrivacyMode = false): string {
  if (isPrivacyMode) return 'R$ ••••••';
  const dec =
    typeof value === 'object' && value !== null && 'amount' in value && 'currency' in value
      ? value.amount
      : new Decimal(value);
  if (!dec.isFinite()) return '—';
  const abs = dec.abs();
  if (abs.gt(0) && abs.lt(1)) {
    return formatUnitPriceBRL(dec.toFixed(6));
  }
  return `R$ ${dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber().toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
