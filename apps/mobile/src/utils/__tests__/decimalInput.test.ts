import { parseDecimalInput, formatDecimalInput } from '../decimalInput';
import { normalizeTargetsToHundred, recalculateUnlockedTargets } from '../../domain/finance';

describe('decimalInput', () => {
  it('aceita vírgula e ponto sem arredondar', () => {
    expect(parseDecimalInput('12,5')).toBe(12.5);
    expect(parseDecimalInput('12.75')).toBe(12.75);
    expect(parseDecimalInput('0,333')).toBe(0.333);
  });
  it('aceita estados intermediários e rejeita lixo', () => {
    expect(parseDecimalInput('12,')).toBe(12);
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput(',')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('1,2,3')).toBeNull();
  });
  it('formata com vírgula e sem zeros à direita', () => {
    expect(formatDecimalInput(12.5)).toBe('12,5');
    expect(formatDecimalInput(13)).toBe('13');
    expect(formatDecimalInput(33.333333)).toBe('33,33');
  });
});

describe('metas quebradas', () => {
  it('o valor digitado no ativo alterado é preservado (ex.: 12,5%)', () => {
    const items = [
      { id: 'a', percentage: 50 },
      { id: 'b', percentage: 30 },
      { id: 'c', percentage: 20 },
    ];
    const out = recalculateUnlockedTargets(items, 'a', 12.5);
    expect(out.find((i) => i.id === 'a')!.percentage).toBe(12.5);
    expect(out.reduce((s, i) => s + i.percentage, 0)).toBeCloseTo(100, 5);
  });
  it('normalizeTargetsToHundred fecha em 100 mantendo casas decimais', () => {
    const out = normalizeTargetsToHundred([
      { id: 'a', percentage: 33.33 },
      { id: 'b', percentage: 33.33 },
      { id: 'c', percentage: 33.33 },
    ]);
    expect([...out.map((i) => i.percentage)].sort()).toEqual([33.33, 33.33, 33.34]);
    expect(out.reduce((s, i) => s + i.percentage, 0)).toBeCloseTo(100, 5);
  });
  it('nunca gera meta negativa ao redistribuir muitos ativos (arredondamento)', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({ id: `x${i}`, percentage: i === 0 ? 14 : 8.6 }));
    const out = recalculateUnlockedTargets(items, 'x0', 12.5);
    expect(out.every((i) => i.percentage >= 0)).toBe(true);
    expect(out.find((i) => i.id === 'x0')!.percentage).toBe(12.5);
    expect(out.reduce((s, i) => s + i.percentage, 0)).toBeCloseTo(100, 5);
  });
});
