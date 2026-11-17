import {
  calculateInvestmentCostBasis,
  mapPluggyInvestment,
  mapPluggyInvestmentTransaction,
  resolvePluggyAssetClass,
} from '../investments';
import { calculatePositionFromTransactions } from '../../finance/averagePrice';
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
} from '../../../services/pluggy/types';

function makeInv(overrides: Partial<PluggyInvestment> = {}): PluggyInvestment {
  return {
    id: 'inv-1',
    itemId: 'item-1',
    type: 'EQUITY',
    subtype: 'STOCK',
    balance: 3500.0,
    amount: 3500.0,
    amountOriginal: 3000.0,
    quantity: 100,
    code: 'PETR4',
    isin: 'BRPETRACNPR6',
    name: 'PETROBRAS PN',
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-11-16T10:00:00Z',
    ...overrides,
  };
}

describe('Sprint 71 — Mapeamento de Investimentos e Custos Pluggy (Fase A)', () => {
  it('S71-T01: mapPluggyInvestmentTransaction soma expenses quando presente e só usa |netAmount| - |amount| quando expenses é nulo', () => {
    const withExpenses: PluggyInvestmentTransaction = {
      id: 'tx-exp-1',
      type: 'BUY',
      quantity: 100,
      value: 30.0,
      amount: 3000.0,
      netAmount: 3020.0, // diferença seria 20, mas expenses é a fonte oficial
      date: '2026-03-10T12:00:00Z',
      expenses: {
        brokerageFee: 4.5,
        exchangeFee: 1.25,
        settlementFee: 0.75,
        serviceTax: 0.5,
        other: null,
      },
    };
    const mappedWithExp = mapPluggyInvestmentTransaction(withExpenses, 'inv-1');
    expect(mappedWithExp.fees).toBe('7.00');

    const withoutExpenses: PluggyInvestmentTransaction = {
      id: 'tx-no-exp-1',
      type: 'BUY',
      quantity: 100,
      value: 30.0,
      amount: 3000.0,
      netAmount: 3005.5,
      date: '2026-03-10T12:00:00Z',
      expenses: null,
    };
    const mappedFallback = mapPluggyInvestmentTransaction(withoutExpenses, 'inv-1');
    expect(mappedFallback.fees).toBe('5.50');
  });

  it('S71-T02: ações, FIIs, BDRs e ETFs não gravam manual_position_value e não inventam quantidade 1 quando nula', () => {
    const stock = mapPluggyInvestment(
      makeInv({ id: 's1', type: 'EQUITY', subtype: 'STOCK', code: 'VALE3', quantity: null, balance: 5000 })
    );
    expect(stock.marketValue).toBeNull();
    expect(stock.quantity).toBe('0');

    const fii = mapPluggyInvestment(
      makeInv({ id: 'f1', type: 'EQUITY', subtype: 'REAL_ESTATE_FUND', code: 'HGLG11', quantity: 20, balance: 3200 })
    );
    expect(fii.marketValue).toBeNull();
    expect(fii.quantity).toBe('20');

    const bdr = mapPluggyInvestment(
      makeInv({ id: 'b1', type: 'EQUITY', subtype: 'BDR', code: 'AAPL34', quantity: 10, balance: 800 })
    );
    expect(bdr.marketValue).toBeNull();

    const etf = mapPluggyInvestment(
      makeInv({ id: 'e1', type: 'ETF', subtype: 'ETF', code: 'BOVA11', quantity: 15, balance: 1800 })
    );
    expect(etf.marketValue).toBeNull();
    expect(etf.isEtf).toBe(true);
  });

  it('S71-T03: mapPluggyInvestment preserva issuerCNPJ, issueDate, purchaseDate, taxes e taxes2 sem inventar zero', () => {
    const cdb = mapPluggyInvestment(
      makeInv({
        id: 'cdb-fields',
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        code: null,
        isin: null,
        name: 'CDB Banco BTG Pactual',
        issuer: 'Banco BTG Pactual S.A.',
        issuerCNPJ: '30.306.294/0001-45',
        issueDate: '2025-03-01T00:00:00Z',
        purchaseDate: '2025-03-05T00:00:00Z',
        dueDate: '2028-03-01T00:00:00Z',
        taxes: 45.12,
        taxes2: 12.34,
        quantity: null,
        balance: 10500.0,
        amountOriginal: 10000.0,
      })
    );
    expect(cdb.issuerCnpj).toBe('30.306.294/0001-45');
    expect(cdb.issueDate).toBe('2025-03-01');
    expect(cdb.purchaseDate).toBe('2025-03-05');
    expect(cdb.taxes).toBe('45.12');
    expect(cdb.taxes2).toBe('12.34');

    const missingFields = mapPluggyInvestment(
      makeInv({
        id: 'cdb-missing',
        type: 'FIXED_INCOME',
        subtype: 'CDB',
        code: null,
        issuerCNPJ: null,
        issueDate: null,
        purchaseDate: null,
        taxes: null,
        taxes2: null,
      })
    );
    expect(missingFields.issuerCnpj).toBeNull();
    expect(missingFields.issueDate).toBeNull();
    expect(missingFields.purchaseDate).toBeNull();
    expect(missingFields.taxes).toBeNull();
    expect(missingFields.taxes2).toBeNull();
  });

  it('S71-T04: ação com 3 compras e 1 venda bate exatamente com averagePrice.ts', () => {
    const inv = makeInv({ quantity: 220, amountOriginal: 9999 });
    const rawTxs: PluggyInvestmentTransaction[] = [
      { id: 't1', type: 'BUY', quantity: 100, value: 20, amount: 2000, date: '2026-01-10', expenses: { brokerageFee: 5 } },
      { id: 't2', type: 'BUY', quantity: 100, value: 25, amount: 2500, date: '2026-02-10', expenses: { brokerageFee: 5 } },
      { id: 't3', type: 'SELL', quantity: 80, value: 30, amount: 2400, date: '2026-03-10' },
      { id: 't4', type: 'BUY', quantity: 100, value: 28, amount: 2800, date: '2026-04-10', expenses: { brokerageFee: 10 } },
    ];
    const mapped = rawTxs.map((t) => mapPluggyInvestmentTransaction(t, inv.id));
    const cost = calculateInvestmentCostBasis(inv, mapped);
    const expected = calculatePositionFromTransactions(
      mapped.map((m) => ({
        type: m.type as 'BUY' | 'SELL',
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        fees: m.fees,
      }))
    );

    expect(cost.coveredByHistory).toBe(true);
    expect(cost.averagePrice).toBe(expected.averagePrice);
    expect(cost.totalInvested).toBe(expected.totalInvested);
  });

  it('S71-T05: AMORTIZATION reduz o custo sem alterar quantidade; TAX não altera quantidade', () => {
    const inv = makeInv({
      type: 'FIXED_INCOME',
      subtype: 'DEBENTURES',
      code: null,
      quantity: 10,
      amountOriginal: 10000,
    });
    const txs = [
      mapPluggyInvestmentTransaction(
        { id: 'b1', type: 'BUY', quantity: 10, value: 1000, amount: 10000, date: '2026-01-10' },
        inv.id
      ),
      mapPluggyInvestmentTransaction(
        { id: 'a1', type: 'AMORTIZATION', amount: 2000, date: '2026-03-10' },
        inv.id
      ),
      mapPluggyInvestmentTransaction(
        { id: 'x1', type: 'TAX', amount: 150, date: '2026-05-10' },
        inv.id
      ),
    ];

    const cost = calculateInvestmentCostBasis(inv, txs);
    expect(cost.coveredByHistory).toBe(true);
    expect(cost.totalInvested).toBe('8000.00');
    expect(cost.averagePrice).toBe('800.00');
  });

  it('S71-T06: TRANSFER sem quantidade e preço é ignorada; TRANSFER com quantidade e preço entra sem duplicar compra', () => {
    const inv = makeInv({ quantity: 100 });
    const txsNoPrice = [
      mapPluggyInvestmentTransaction(
        { id: 'b1', type: 'BUY', quantity: 100, value: 30, amount: 3000, date: '2026-01-10' },
        inv.id
      ),
      mapPluggyInvestmentTransaction(
        { id: 'tr1', type: 'TRANSFER', quantity: 100, value: null, amount: null, date: '2026-02-10' },
        inv.id
      ),
    ];
    const cost1 = calculateInvestmentCostBasis(inv, txsNoPrice);
    expect(cost1.coveredByHistory).toBe(true);
    expect(cost1.totalInvested).toBe('3000.00');

    const txsTransferWithPrice = [
      mapPluggyInvestmentTransaction(
        { id: 'tr2', type: 'TRANSFER', quantity: 100, value: 32, amount: 3200, date: '2026-02-10' },
        inv.id
      ),
    ];
    const cost2 = calculateInvestmentCostBasis(inv, txsTransferWithPrice);
    expect(cost2.coveredByHistory).toBe(true);
    expect(cost2.totalInvested).toBe('3200.00');
    expect(cost2.averagePrice).toBe('32.00');
  });

  it('S71-T07: resolvePluggyAssetClass cobre BDR, ETF, ETF_FUND, FI_INFRA, FI_AGRO, RETIREMENT, TREASURY, DEBENTURES, CRI, CRA, COE e OFFSHORE_FUND', () => {
    expect(resolvePluggyAssetClass(makeInv({ type: 'EQUITY', subtype: 'BDR' }))).toEqual({
      assetClass: 'STOCK',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'ETF', subtype: 'ETF' }))).toEqual({
      assetClass: 'STOCK',
      isEtf: true,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'MUTUAL_FUND', subtype: 'ETF_FUND' }))).toEqual({
      assetClass: 'STOCK',
      isEtf: true,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'MUTUAL_FUND', subtype: 'FI_INFRA' }))).toEqual({
      assetClass: 'FII',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'MUTUAL_FUND', subtype: 'FI_AGRO' }))).toEqual({
      assetClass: 'FII',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'SECURITY', subtype: 'RETIREMENT' }))).toEqual({
      assetClass: 'FUNDS',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'MUTUAL_FUND', subtype: 'OFFSHORE_FUND' }))).toEqual({
      assetClass: 'FUNDS',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'FIXED_INCOME', subtype: 'TREASURY' }))).toEqual({
      assetClass: 'FIXED_INCOME',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'FIXED_INCOME', subtype: 'DEBENTURES' }))).toEqual({
      assetClass: 'FIXED_INCOME',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'FIXED_INCOME', subtype: 'CRI' }))).toEqual({
      assetClass: 'FIXED_INCOME',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'FIXED_INCOME', subtype: 'CRA' }))).toEqual({
      assetClass: 'FIXED_INCOME',
      isEtf: false,
    });
    expect(resolvePluggyAssetClass(makeInv({ type: 'COE', subtype: 'STRUCTURED_NOTE' }))).toEqual({
      assetClass: 'FIXED_INCOME',
      isEtf: false,
    });
  });

  it('S71-T08: renda fixa sem quantidade recebe quantidade 1, marketValue = balance e custo = amountOriginal', () => {
    const rf = makeInv({
      id: 'rf-no-qty',
      type: 'FIXED_INCOME',
      subtype: 'LCI',
      code: null,
      name: 'LCI Banco ABC',
      issuer: 'Banco ABC',
      quantity: null,
      balance: 11250.5,
      amount: 11250.5,
      amountOriginal: 10000.0,
    });
    const mapped = mapPluggyInvestment(rf);
    const cost = calculateInvestmentCostBasis(rf, []);

    expect(mapped.quantity).toBe('1');
    expect(mapped.marketValue).toBe('11250.50');
    expect(cost.totalInvested).toBe('10000.00');
    expect(cost.averagePrice).toBe('10000.00');
  });
});
