import { findEquivalentIncome, type IncomeDedupCandidate } from '../incomeDedup';

function makeInc(overrides: Partial<IncomeDedupCandidate> = {}): IncomeDedupCandidate {
  return {
    id: 'inc-1',
    portfolioId: 'port-1',
    ticker: 'PETR4',
    payDate: '2026-06-15',
    amount: '100.00',
    kind: 'DIVIDENDO',
    source: 'B3_IMPORT',
    ...overrides,
  };
}

describe('Sprint 72 — Deduplicação Cruzada de Proventos B3 × Pluggy × Manual (Fase A)', () => {
  it('S72-T07: casa ticker normalizado com sufixo fracionário F (PETR4F === PETR4)', () => {
    const existing = [makeInc({ ticker: 'PETR4' })];
    const match = findEquivalentIncome(makeInc({ ticker: 'PETR4F', source: 'OPEN_FINANCE' }), existing);
    expect(match?.id).toBe('inc-1');
  });

  it('S72-T08: aceita divergência de data de até 3 dias corridos (D vs D+2 e D-3)', () => {
    const existing = [makeInc({ payDate: '2026-06-15' })];
    expect(findEquivalentIncome(makeInc({ payDate: '2026-06-17' }), existing)?.id).toBe('inc-1');
    expect(findEquivalentIncome(makeInc({ payDate: '2026-06-12' }), existing)?.id).toBe('inc-1');
    expect(findEquivalentIncome(makeInc({ payDate: '2026-06-19' }), existing)).toBeNull();
  });

  it('S72-T09: aceita diferença de valor de até R$ 0,01 e rejeita diferença maior fora de JCP', () => {
    const existing = [makeInc({ amount: '100.00' })];
    expect(findEquivalentIncome(makeInc({ amount: '100.01' }), existing)?.id).toBe('inc-1');
    expect(findEquivalentIncome(makeInc({ amount: '99.99' }), existing)?.id).toBe('inc-1');
    expect(findEquivalentIncome(makeInc({ amount: '100.50' }), existing)).toBeNull();
  });

  it('S72-T10: casa JCP bruto × líquido (15% IR, tolerância de 1%) na mesma janela de data', () => {
    const existing = [makeInc({ kind: 'JCP', amount: '100.00', payDate: '2026-06-15' })];
    // Pluggy entrega líquido de 15% = 85.00
    const match = findEquivalentIncome(
      makeInc({ kind: 'JCP', amount: '85.00', payDate: '2026-06-16', source: 'OPEN_FINANCE' }),
      existing
    );
    expect(match?.id).toBe('inc-1');

    // Inverso: líquido existente (85.00) × candidato bruto (100.00)
    const existingNet = [makeInc({ id: 'inc-net', kind: 'JCP', amount: '85.00' })];
    expect(
      findEquivalentIncome(makeInc({ kind: 'JCP', amount: '100.00' }), existingNet)?.id
    ).toBe('inc-net');
  });

  it('S72-T11: kind vazio ou PROVENTO/OUTRO casa com qualquer kind específico; DIVIDENDO não casa com JCP', () => {
    const existingDiv = [makeInc({ kind: 'DIVIDENDO' })];
    expect(findEquivalentIncome(makeInc({ kind: null }), existingDiv)?.id).toBe('inc-1');
    expect(findEquivalentIncome(makeInc({ kind: 'PROVENTO' }), existingDiv)?.id).toBe('inc-1');
    expect(findEquivalentIncome(makeInc({ kind: 'JCP' }), existingDiv)).toBeNull();
  });

  it('S72-T12: comparação é por ticker em TODAS as carteiras (carteiras diferentes também casam)', () => {
    const existing = [makeInc({ portfolioId: 'port-b3' })];
    const match = findEquivalentIncome(makeInc({ portfolioId: 'port-pluggy' }), existing);
    expect(match?.id).toBe('inc-1');
  });

  it('S72-T13: dois proventos diferentes do mesmo ativo no mesmo mês (valores distintos) NÃO casam', () => {
    const existing = [makeInc({ payDate: '2026-06-05', amount: '50.00' })];
    const second = findEquivalentIncome(makeInc({ payDate: '2026-06-20', amount: '75.00' }), existing);
    expect(second).toBeNull();
  });
});
