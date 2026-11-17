/**
 * Sprint 95 — Taxas da nota de corretagem.
 * Origem: backup de 17/11/2026. A corretora manda em `expenses.other` o total da nota (bruto + taxas) e repete
 * as taxas da nota inteira em cada transação. Cada compra de 26/10 recebeu R$ 2.828,74 de "taxa" e a carteira
 * ficou com −92,7% de rentabilidade.
 */
import {
  mapPluggyInvestmentTransaction,
  prorateSharedNoteFees,
} from '../investments';
import type { PluggyInvestmentTransaction } from '../../../services/pluggy/types';

function tx(overrides: Partial<PluggyInvestmentTransaction>): PluggyInvestmentTransaction {
  return {
    id: 'tx-default',
    type: 'BUY',
    movementType: 'CREDIT',
    quantity: 1,
    value: 100,
    amount: 100,
    agreedRate: null,
    indexerPercentage: null,
    priceFactor: 1,
    date: '2026-10-26T00:00:00.000Z',
    tradeDate: '2026-10-26T00:00:00.000Z',
    description: null,
    netAmount: null,
    brokerageNumber: null,
    expenses: null,
    ...overrides,
  } as PluggyInvestmentTransaction;
}

const B3_NOTE_FEES = { stockExchangeFee: 0.14, tradingAssetsNoticeFee: 0.07, clearingFee: 0.63 };

describe('Sprint 95 — taxas da nota de corretagem', () => {
  it('S95-T01: despesa maior ou igual ao valor da operação é o total da nota e não entra como taxa', () => {
    const m = mapPluggyInvestmentTransaction(
      tx({
        id: 'petr4-1',
        quantity: 1,
        value: 52.52,
        amount: 52.52,
        brokerageNumber: '46780',
        expenses: { ...B3_NOTE_FEES, other: 2827.9 } as any,
      }),
      'inv-petr4'
    );
    expect(m.fees).toBe('0.84');
    expect(m.totalAmount).toBe('53.36');
    expect(m.unitPrice).toBe('52.52000000');
    expect(m.warnings.some((w) => /nota/i.test(w))).toBe(true);
  });

  it('S95-T02: despesa pequena em `other` continua sendo taxa', () => {
    const m = mapPluggyInvestmentTransaction(
      tx({ id: 'x', quantity: 10, value: 100, amount: 1000, expenses: { brokerageFee: 4.9, other: 0.05 } as any }),
      'inv-x'
    );
    expect(m.fees).toBe('4.95');
    expect(m.totalAmount).toBe('1004.95');
    expect(m.warnings.some((w) => /nota/i.test(w))).toBe(false);
  });

  it('S95-T01b: o mapeamento expõe o número da nota e o valor bruto da operação', () => {
    const m = mapPluggyInvestmentTransaction(
      tx({ id: 'y', quantity: 3, value: 31.11, amount: 93.33, brokerageNumber: '46780' }),
      'inv-y'
    );
    expect(m.brokerageNumber).toBe('46780');
    expect(m.grossAmount).toBe('93.33');
  });

  it('S95-T03: mesma taxa repetida nas operações da mesma nota é rateada pelo valor de cada operação', () => {
    const mapped = [
      tx({ id: 'a', quantity: 1, value: 100, amount: 100, brokerageNumber: 'N1', expenses: B3_NOTE_FEES as any }),
      tx({ id: 'b', quantity: 2, value: 100, amount: 200, brokerageNumber: 'N1', expenses: B3_NOTE_FEES as any }),
      tx({ id: 'c', quantity: 7, value: 100, amount: 700, brokerageNumber: 'N1', expenses: B3_NOTE_FEES as any }),
    ].map((t) => mapPluggyInvestmentTransaction(t, `inv-${t.id}`));

    const out = prorateSharedNoteFees(mapped);
    expect(out.map((m) => m.externalId)).toEqual(['a', 'b', 'c']);
    expect(out.map((m) => m.fees)).toEqual(['0.08', '0.17', '0.59']);
    expect(out.map((m) => m.totalAmount)).toEqual(['100.08', '200.17', '700.59']);
    expect(out.map((m) => m.unitPrice)).toEqual(mapped.map((m) => m.unitPrice));
    const sum = out.reduce((acc, m) => acc + Math.round(Number(m.fees) * 100), 0);
    expect(sum).toBe(84);
  });

  it('S95-T03b: venda na mesma nota também é rateada e o total líquido desconta só a sua parte', () => {
    const mapped = [
      tx({ id: 'buy', type: 'BUY', quantity: 5, value: 100, amount: 500, brokerageNumber: 'N2', expenses: B3_NOTE_FEES as any }),
      tx({
        id: 'sell',
        type: 'SELL',
        quantity: 5,
        value: 100,
        amount: 500,
        netAmount: 499.16,
        brokerageNumber: 'N2',
        expenses: B3_NOTE_FEES as any,
      }),
    ].map((t) => mapPluggyInvestmentTransaction(t, `inv-${t.id}`));

    const out = prorateSharedNoteFees(mapped);
    expect(out.map((m) => m.fees)).toEqual(['0.42', '0.42']);
    expect(out[0].totalAmount).toBe('500.42');
    expect(out[1].totalAmount).toBe('499.58');
  });

  it('S95-T04: não rateia taxas diferentes, operação única nem notas diferentes', () => {
    const differentFees = [
      tx({ id: 'd1', amount: 100, brokerageNumber: 'N3', expenses: { brokerageFee: 4.9 } as any }),
      tx({ id: 'd2', amount: 100, brokerageNumber: 'N3', expenses: { brokerageFee: 2.5 } as any }),
    ].map((t) => mapPluggyInvestmentTransaction(t, 'inv-d'));
    expect(prorateSharedNoteFees(differentFees).map((m) => m.fees)).toEqual(['4.90', '2.50']);

    const single = [tx({ id: 's1', amount: 100, brokerageNumber: 'N4', expenses: B3_NOTE_FEES as any })].map((t) =>
      mapPluggyInvestmentTransaction(t, 'inv-s')
    );
    expect(prorateSharedNoteFees(single).map((m) => m.fees)).toEqual(['0.84']);

    const otherNotes = [
      tx({ id: 'o1', amount: 100, brokerageNumber: 'N5', expenses: B3_NOTE_FEES as any }),
      tx({ id: 'o2', amount: 100, brokerageNumber: 'N6', expenses: B3_NOTE_FEES as any }),
    ].map((t) => mapPluggyInvestmentTransaction(t, 'inv-o'));
    expect(prorateSharedNoteFees(otherNotes).map((m) => m.fees)).toEqual(['0.84', '0.84']);
  });

  it('S95-T05: sem número de nota, agrupa pelo pregão (mesma data e mesma taxa)', () => {
    const mapped = [
      tx({ id: 'p1', amount: 300, tradeDate: '2026-11-06T00:00:00.000Z', expenses: { clearingFee: 0.17 } as any }),
      tx({ id: 'p2', amount: 100, tradeDate: '2026-11-06T00:00:00.000Z', expenses: { clearingFee: 0.17 } as any }),
      tx({ id: 'p3', amount: 100, tradeDate: '2026-11-07T00:00:00.000Z', expenses: { clearingFee: 0.17 } as any }),
    ].map((t) => mapPluggyInvestmentTransaction(t, `inv-${t.id}`));

    const out = prorateSharedNoteFees(mapped);
    expect(out.map((m) => m.fees)).toEqual(['0.13', '0.04', '0.17']);
  });

  it('S95-T05b: operações que não são compra ou venda ficam fora do rateio', () => {
    const mapped = [
      tx({ id: 'i1', type: 'INTEREST', amount: 10, brokerageNumber: 'N7', expenses: B3_NOTE_FEES as any }),
      tx({ id: 'i2', type: 'BUY', amount: 100, brokerageNumber: 'N7', expenses: B3_NOTE_FEES as any }),
    ].map((t) => mapPluggyInvestmentTransaction(t, `inv-${t.id}`));
    const out = prorateSharedNoteFees(mapped);
    expect(out[1].fees).toBe('0.84');
  });
});
