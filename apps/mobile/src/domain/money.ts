import Decimal from 'decimal.js';

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

export function centsToDecimal(_cents: number): Decimal {
  throw new Error('Not implemented');
}

export function decimalToCents(_value: Decimal.Value): number {
  throw new Error('Not implemented');
}

export function money(amount: Decimal.Value, currency: Currency = 'BRL'): Money {
  return { amount: new Decimal(amount), currency };
}

export function addMoney(_a: Money, _b: Money): Money {
  throw new Error('Not implemented');
}

export function convert(
  _m: Money,
  _rate: Decimal.Value,
  _rateDate: string,
  _targetCurrency?: Currency
): ConvertedMoney {
  throw new Error('Not implemented');
}
