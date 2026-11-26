import Decimal from 'decimal.js';
import {
  centsToDecimal,
  decimalToCents,
  money,
  addMoney,
  convert,
} from '../money';
import { toCentsDecimal } from '../openFinance';

describe('Sprint 103 — R38 Dinheiro único (src/domain/money.ts)', () => {
  test('S103-T01: centsToDecimal converte 0, 1, 99, 123456789 e negativos sem erro de ponto flutuante', () => {
    expect(centsToDecimal(0).toFixed(2)).toBe('0.00');
    expect(centsToDecimal(1).toFixed(2)).toBe('0.01');
    expect(centsToDecimal(99).toFixed(2)).toBe('0.99');
    expect(centsToDecimal(123456789).toFixed(2)).toBe('1234567.89');
    expect(centsToDecimal(-1).toFixed(2)).toBe('-0.01');
    expect(centsToDecimal(-123456789).toFixed(2)).toBe('-1234567.89');
  });

  test('S103-T02: decimalToCents usa o mesmo arredondamento de toCentsDecimal (ROUND_HALF_UP)', () => {
    expect(decimalToCents(0)).toBe(0);
    expect(decimalToCents(-0)).toBe(0);
    expect(decimalToCents('0.01')).toBe(1);
    expect(decimalToCents('0.99')).toBe(99);
    expect(decimalToCents('1234567.89')).toBe(123456789);
    expect(decimalToCents(-1234567.89)).toBe(-123456789);
    // 1.005 * 100 = 100.5 -> ROUND_HALF_UP = 101
    expect(decimalToCents(1.005)).toBe(101);
    expect(decimalToCents(new Decimal('19.99'))).toBe(1999);
  });

  test('S103-T03: ida e volta cents <-> Decimal preserva exatamente os valores', () => {
    const samples = [0, 1, 99, 123456789, -1, -99, -123456789];
    for (const cents of samples) {
      const dec = centsToDecimal(cents);
      expect(dec).toBeInstanceOf(Decimal);
      expect(decimalToCents(dec)).toBe(cents);
    }
  });

  test('S103-T04: convert USD -> BRL com taxa 5,1234, arredondamento e rateDate preservada', () => {
    // Conta à mão: USD 10.00 * 5.1234 = 51.234 BRL -> ROUND_HALF_UP 2 casas = 51.23 BRL
    const res1 = convert(money('10.00', 'USD'), '5.1234', '2026-11-26');
    expect(res1.money.currency).toBe('BRL');
    expect(res1.money.amount.toFixed(2)).toBe('51.23');
    expect(res1.rate.toString()).toBe('5.1234');
    expect(res1.rateDate).toBe('2026-11-26');

    // Conta à mão: USD 10.01 * 5.1234 = 51.285234 BRL -> ROUND_HALF_UP 2 casas = 51.29 BRL
    const res2 = convert(money('10.01', 'USD'), '5.1234', '2026-11-26');
    expect(res2.money.currency).toBe('BRL');
    expect(res2.money.amount.toFixed(2)).toBe('51.29');
  });

  test('S103-T05: Money em USD nunca soma com BRL sem convert (lança erro)', () => {
    const brl = money('100.00', 'BRL');
    const usd = money('10.00', 'USD');

    expect(() => addMoney(brl, usd)).toThrow();
    expect(() => addMoney(usd, brl)).toThrow();

    // Mesma moeda soma normalmente: 100.00 + 25.50 = 125.50
    const sumBrl = addMoney(brl, money('25.50', 'BRL'));
    expect(sumBrl.currency).toBe('BRL');
    expect(sumBrl.amount.toFixed(2)).toBe('125.50');

    // Após convert(), soma funciona: 100.00 + 51.23 = 151.23
    const converted = convert(usd, '5.1234', '2026-11-26').money;
    const total = addMoney(brl, converted);
    expect(total.currency).toBe('BRL');
    expect(total.amount.toFixed(2)).toBe('151.23');
  });

  test('S103-T06: toCentsDecimal delega para a mesma lógica de decimalToCents', () => {
    expect(toCentsDecimal(1.005)).toBe(decimalToCents(1.005));
    expect(toCentsDecimal(-123.45)).toBe(decimalToCents(-123.45));
    expect(toCentsDecimal('0.14')).toBe(decimalToCents('0.14'));
  });
});
