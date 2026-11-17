import { mapPluggyIncomeEvent } from '../investments';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '../../../services/pluggy/types';

function makeInv(overrides: Partial<PluggyInvestment> = {}): PluggyInvestment {
  return {
    id: 'inv-1',
    itemId: 'item-1',
    type: 'EQUITY',
    subtype: 'STOCK',
    code: 'PETR4F',
    name: 'PETROBRAS PN',
    quantity: 100,
    balance: 3500,
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    ...overrides,
  };
}

function makeTx(overrides: Partial<PluggyInvestmentTransaction> = {}): PluggyInvestmentTransaction {
  return {
    id: 'tx-int-1',
    type: 'INTEREST',
    movementType: 'CREDIT',
    amount: 100.0,
    date: '2026-06-15T00:00:00Z',
    description: 'DIVIDENDOS PETR4',
    ...overrides,
  };
}

describe('Sprint 72 — Mapeamento de Proventos Pluggy (Fase A)', () => {
  it('S72-T01: usa netAmount quando disponível e cai para amount quando netAmount é nulo, sempre positivo em 2 casas', () => {
    const withNet = mapPluggyIncomeEvent(
      makeTx({ id: 'tx-1', amount: 100.0, netAmount: 85.0 }),
      makeInv()
    );
    expect(withNet.amount).toBe('85.00');
    expect(withNet.externalId).toBe('pluggy:tx-1');
    expect(withNet.source).toBe('OPEN_FINANCE');
    expect(withNet.ticker).toBe('PETR4');
    expect(withNet.payDate).toBe('2026-06-15');

    const withoutNet = mapPluggyIncomeEvent(
      makeTx({ id: 'tx-2', amount: -120.5, netAmount: null }),
      makeInv()
    );
    expect(withoutNet.amount).toBe('120.50');
  });

  it('S72-T02: preserva quantity e unitAmount quando informados e mantém null quando ausentes', () => {
    const withQty = mapPluggyIncomeEvent(
      makeTx({ quantity: 100, value: 0.85, netAmount: 85 }),
      makeInv()
    );
    expect(withQty.quantity).toBe('100');
    expect(withQty.unitAmount).toBe('0.85');

    const withoutQty = mapPluggyIncomeEvent(
      makeTx({ quantity: null, value: null }),
      makeInv()
    );
    expect(withoutQty.quantity).toBeNull();
    expect(withoutQty.unitAmount).toBeNull();
  });

  it('S72-T03: classifica JCP por "jcp" ou "juros sobre capital" (sem acento, case-insensitive)', () => {
    expect(
      mapPluggyIncomeEvent(makeTx({ description: 'JCP PETROBRAS PN' }), makeInv()).kind
    ).toBe('JCP');
    expect(
      mapPluggyIncomeEvent(makeTx({ description: 'Juros sobre Capital Próprio' }), makeInv()).kind
    ).toBe('JCP');
  });

  it('S72-T04: classifica DIVIDENDO por "dividend"', () => {
    expect(
      mapPluggyIncomeEvent(makeTx({ description: 'DIVIDENDO MENSAL' }), makeInv()).kind
    ).toBe('DIVIDENDO');
    expect(
      mapPluggyIncomeEvent(makeTx({ description: 'Dividend Payment' }), makeInv()).kind
    ).toBe('DIVIDENDO');
  });

  it('S72-T05: classifica RENDIMENTO por "rendimento" ou para ativo FII mesmo sem descrição', () => {
    expect(
      mapPluggyIncomeEvent(makeTx({ description: 'Rendimento de FII' }), makeInv()).kind
    ).toBe('RENDIMENTO');

    const fii = makeInv({ type: 'EQUITY', subtype: 'REAL_ESTATE_FUND', code: 'HGLG11' });
    expect(mapPluggyIncomeEvent(makeTx({ description: null }), fii).kind).toBe('RENDIMENTO');
  });

  it('S72-T06: renda fixa / COE e descrição vazia em ação caem em PROVENTO', () => {
    const cdb = makeInv({
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      code: null,
      issuer: 'Banco BTG Pactual',
    });
    expect(
      mapPluggyIncomeEvent(makeTx({ description: 'Pagamento de Cupom' }), cdb).kind
    ).toBe('PROVENTO');
    expect(mapPluggyIncomeEvent(makeTx({ description: '' }), makeInv()).kind).toBe('PROVENTO');
  });
});
