import { calculateAllocationFill } from '..';

describe('calculateAllocationFill', () => {
  it('abaixo, na e acima da meta: sempre o valor real da participação', () => {
    expect(calculateAllocationFill(15)).toBe(15); // Ações da AUVP (meta 25%)
    expect(calculateAllocationFill(30)).toBe(30); // na meta
    expect(calculateAllocationFill(85)).toBe(85); // FII da AUVP (meta 30%): 85%, não 100%
  });
  it('sem posição é vazio; fora da faixa fica entre 0 e 100', () => {
    expect(calculateAllocationFill(0)).toBe(0);
    expect(calculateAllocationFill(140)).toBe(100);
    expect(calculateAllocationFill(-5)).toBe(0);
    expect(calculateAllocationFill(NaN)).toBe(0);
  });
});
