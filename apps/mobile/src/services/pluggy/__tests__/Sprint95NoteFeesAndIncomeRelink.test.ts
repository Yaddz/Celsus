/**
 * Sprint 95 — Sync: taxas da nota rateadas no custo e proventos já gravados na conta reprocessados.
 */
import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { finEntries, incomeEvents, transactions } from '../../../db/schema';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { finRepository } from '../../../repositories/finRepository';
import { incomeRepository } from '../../../repositories/incomeRepository';
import {
  makePluggyItem,
  makeSprint84OpenApiInvestment,
  makeSprint84OpenApiInvestmentTx,
} from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '../types';

function makeMockClient(
  invs: PluggyInvestment[],
  txsByInv: Record<string, PluggyInvestmentTransaction[]>
): PluggyClient {
  return {
    getItem: async (id: string) => makePluggyItem({ id }),
    listInvestments: async () => invs,
    listInvestmentTransactions: async (invId: string) => txsByInv[invId] ?? [],
  } as unknown as PluggyClient;
}

const NOTE1_FEES = { stockExchangeFee: 0.14, tradingAssetsNoticeFee: 0.07, clearingFee: 0.63 };
const NOTE2_FEES = { stockExchangeFee: 0.03, tradingAssetsNoticeFee: 0.01, clearingFee: 0.13 };

function equity(id: string, code: string, subtype: string, quantity: number, balance: number) {
  return makeSprint84OpenApiInvestment({
    id,
    itemId: 'item-d2f7',
    type: 'EQUITY',
    subtype: subtype as any,
    code,
    name: code,
    quantity,
    value: balance / quantity,
    balance,
    amount: balance,
    amountOriginal: null,
    priceFactor: 1,
  });
}

function buy(
  id: string,
  qty: number,
  price: number,
  date: string,
  note: string,
  fees: Record<string, number>,
  noteTotal: number
) {
  const amount = Math.round(qty * price * 100) / 100;
  return makeSprint84OpenApiInvestmentTx({
    id,
    type: 'BUY',
    movementType: 'CREDIT',
    quantity: qty,
    value: price,
    amount,
    netAmount: amount,
    date: `${date}T00:00:00.000Z`,
    tradeDate: `${date}T00:00:00.000Z`,
    brokerageNumber: note,
    priceFactor: 1,
    description: null,
    expenses: { ...fees, other: noteTotal } as any,
  });
}

describe('Sprint 95 — taxas da nota no sync de investimentos', () => {
  beforeEach(() => {
    resetDatabase();
  });

  async function syncNoteScenario(portfolioId: string) {
    // Nota 1 (26/10): PETR4 52,52 + HGLG11 301,30 = 353,82 bruto; taxas B3 0,84; `other` = total da nota
    // Nota 2 (06/11): PETR4 45,43 + HGLG11 146,90 = 192,33 bruto; taxas B3 0,17
    const petr = equity('inv-petr4', 'PETR4', 'STOCK', 2, 90.42);
    const hglg = equity('inv-hglg11', 'HGLG11', 'REAL_ESTATE_FUND', 3, 438.06);
    const client = makeMockClient([petr, hglg], {
      'inv-petr4': [
        buy('petr-1', 1, 52.52, '2026-10-26', '46780', NOTE1_FEES, 354.66),
        buy('petr-2', 1, 45.43, '2026-11-06', '47012', NOTE2_FEES, 192.5),
      ],
      'inv-hglg11': [
        buy('hglg-1', 2, 150.65, '2026-10-26', '46780', NOTE1_FEES, 354.66),
        buy('hglg-2', 1, 146.9, '2026-11-06', '47012', NOTE2_FEES, 192.5),
      ],
    });
    return pluggyInvestmentsSyncService.syncInvestments('item-d2f7', {
      client,
      defaultPortfolioId: portfolioId,
    });
  }

  it('S95-T06: preço médio usa só a parte de cada operação nas taxas da nota', async () => {
    await openFinanceRepository.addItem('item-d2f7');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Corretora d2f7', docket_code: 'D2F7' });

    await syncNoteScenario(portfolio.id);

    const dbAssets = await assetRepository.getAssetsByPortfolio(portfolio.id);
    const petr = dbAssets.find((a) => a.ticker === 'PETR4')!;
    const hglg = dbAssets.find((a) => a.ticker === 'HGLG11')!;
    expect(petr.cost_basis_source).toBe('TRANSACTIONS');
    // (52,52 + 0,12 + 45,43 + 0,04) / 2
    expect(Number(petr.average_price)).toBeCloseTo(49.055, 2);
    // (301,30 + 0,72 + 146,90 + 0,13) / 3
    expect(Number(hglg.average_price)).toBeCloseTo(149.6833, 2);

    const db = getDatabase();
    const petrTxs = await db.select().from(transactions).where(eq(transactions.asset_id, petr.id));
    const byExt = new Map(petrTxs.map((t) => [t.external_id, t]));
    expect(byExt.get('petr-1')!.fees).toBe('0.12');
    expect(byExt.get('petr-1')!.total_amount).toBe('52.64');
    expect(byExt.get('petr-2')!.fees).toBe('0.04');

    const invested =
      Number(petr.quantity) * Number(petr.average_price) + Number(hglg.quantity) * Number(hglg.average_price);
    const market = 90.42 + 438.06;
    expect((market - invested) / invested).toBeGreaterThan(-0.05);
  });

  it('S95-T07: nova sincronização é idempotente (sem duplicar transações nem mudar o custo)', async () => {
    await openFinanceRepository.addItem('item-d2f7');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Corretora d2f7', docket_code: 'D2F7' });

    await syncNoteScenario(portfolio.id);
    const before = await assetRepository.getAssetsByPortfolio(portfolio.id);
    await syncNoteScenario(portfolio.id);
    const after = await assetRepository.getAssetsByPortfolio(portfolio.id);

    expect(after.map((a) => [a.ticker, a.average_price]).sort()).toEqual(
      before.map((a) => [a.ticker, a.average_price]).sort()
    );
    const db = getDatabase();
    const all = await db.select().from(transactions);
    expect(all.filter((t) => !t.is_synthetic)).toHaveLength(4);
  });
});

describe('Sprint 95 — proventos já gravados na conta são reprocessados', () => {
  beforeEach(() => {
    resetDatabase();
  });

  const MXRF11 = makeSprint84OpenApiInvestment({
    id: 'inv-mxrf11',
    itemId: 'item-6ef1',
    type: 'EQUITY',
    subtype: 'REAL_ESTATE_FUND',
    code: 'MXRF11',
    name: 'MXRF11',
    issuer: 'MAXI RENDA FDO INV IMOB - FII',
    quantity: 637,
    value: 8.58,
    balance: 5465.46,
    amount: 5465.46,
    amountOriginal: null,
    priceFactor: 1,
  });
  const MXRF13 = makeSprint84OpenApiInvestment({
    id: 'inv-mxrf13',
    itemId: 'item-6ef1',
    type: 'EQUITY',
    subtype: 'STOCK',
    code: 'MXRF13',
    name: 'MXRF13',
    quantity: 0,
    value: 0,
    balance: 0,
    amount: 0,
    amountOriginal: null,
    priceFactor: 0,
    status: 'TOTAL_WITHDRAWAL',
  });

  async function setupBankEntries() {
    const account = await finRepository.createAccount({
      name: 'Conta corretora',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-acc-6ef1',
    });
    const base = {
      account_id: account.id,
      status: 'paid',
      source: 'OPEN_FINANCE',
      category_id: 'cat-outros-receita',
    };
    await finRepository.createEntriesBatch([
      {
        ...base,
        kind: 'transfer_in',
        amount_cents: 6060,
        due_date: '2026-01-15',
        paid_date: '2026-01-15',
        paid_amount_cents: 6060,
        description: 'Rendimentos de Clientes Mxrf11 S/ 606',
        description_raw: 'RENDIMENTOS DE CLIENTES MXRF11 S/            606',
        external_id: 'bank-mxrf-2026-01',
        of_category_id: '04000000',
        of_class_reason: 'OWN_ACCOUNT_UNPAIRED',
      },
      {
        ...base,
        kind: 'income',
        amount_cents: 4910,
        due_date: '2025-12-12',
        paid_date: '2025-12-12',
        paid_amount_cents: 4910,
        description: 'Rendimentos de Clientes Mxrf11 S/ 491',
        description_raw: 'RENDIMENTOS DE CLIENTES MXRF11 S/            491',
        external_id: 'bank-mxrf-2025-12',
        of_category_id: '03060000',
        of_class_reason: 'SIGN',
      },
      {
        ...base,
        kind: 'income',
        amount_cents: 1008,
        due_date: '2026-08-14',
        paid_date: '2026-08-14',
        paid_amount_cents: 1008,
        description: 'Rendimentos de Clientes Mxrf13 S/ 168',
        description_raw: 'RENDIMENTOS DE CLIENTES MXRF13 S/            168',
        external_id: 'bank-mxrf13-2026-08',
        of_category_id: '03060000',
        of_class_reason: 'SIGN',
      },
      {
        ...base,
        kind: 'income',
        amount_cents: 6060,
        due_date: '2026-03-13',
        paid_date: '2026-03-13',
        paid_amount_cents: 6060,
        description: 'Rendimentos de Clientes Mxrf11 S/ 606',
        description_raw: 'RENDIMENTOS DE CLIENTES MXRF11 S/            606',
        external_id: 'bank-mxrf-removed',
        of_category_id: '03060000',
        of_class_reason: 'SIGN',
        of_removed_at: '2026-11-01T00:00:00.000Z',
      },
      {
        ...base,
        kind: 'income',
        amount_cents: 100000,
        due_date: '2026-11-04',
        paid_date: '2026-11-04',
        paid_amount_cents: 100000,
        description: 'Transferência Recebida',
        description_raw: 'Transferência Recebida|<contraparte>',
        external_id: 'bank-pix-1',
        of_category_id: '05000000',
        of_class_reason: 'SIGN',
      },
    ]);
    return account;
  }

  it('S95-T08: depois do sync de investimentos, créditos "RENDIMENTOS…" sem provento viram provento do ativo', async () => {
    await openFinanceRepository.addItem('item-6ef1');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Corretora 6ef1', docket_code: '6EF1' });
    await setupBankEntries();

    const res = await pluggyInvestmentsSyncService.syncInvestments('item-6ef1', {
      client: makeMockClient([MXRF11, MXRF13], {}),
      defaultPortfolioId: portfolio.id,
    });

    const incomes = await incomeRepository.listAll();
    const bank = incomes.filter((i) => i.source === 'OPEN_FINANCE_BANK');
    expect(bank).toHaveLength(3);
    expect(bank.every((i) => i.ticker === 'MXRF11')).toBe(true);
    expect(bank.every((i) => i.portfolio_id === portfolio.id)).toBe(true);
    expect(bank.map((i) => [i.pay_date, i.amount, i.quantity]).sort()).toEqual([
      ['2025-12-12', '49.10', '491'],
      ['2026-01-15', '60.60', '606'],
      ['2026-08-14', '10.08', '168'],
    ]);
    expect(res.counts.incomesRelinked).toBe(3);

    const db = getDatabase();
    const entries = await db.select().from(finEntries);
    const byExt = new Map(entries.map((e) => [e.external_id, e]));
    for (const ext of ['bank-mxrf-2026-01', 'bank-mxrf-2025-12', 'bank-mxrf13-2026-08']) {
      const e = byExt.get(ext)!;
      expect(e.linked_income_id).toBeTruthy();
      expect(e.kind).toBe('income');
      expect(e.of_class_reason).toBe('INCOME_LINKED');
    }
    expect(byExt.get('bank-mxrf-removed')!.linked_income_id).toBeFalsy();
    expect(byExt.get('bank-pix-1')!.linked_income_id).toBeFalsy();
    expect(byExt.get('bank-pix-1')!.of_class_reason).toBe('SIGN');
  });

  it('S95-T09: reprocessar de novo não duplica proventos', async () => {
    await openFinanceRepository.addItem('item-6ef1');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Corretora 6ef1', docket_code: '6EF1' });
    await setupBankEntries();
    const client = makeMockClient([MXRF11, MXRF13], {});

    await pluggyInvestmentsSyncService.syncInvestments('item-6ef1', { client, defaultPortfolioId: portfolio.id });
    const res2 = await pluggyInvestmentsSyncService.syncInvestments('item-6ef1', {
      client,
      defaultPortfolioId: portfolio.id,
    });

    const incomes = await incomeRepository.listAll();
    expect(incomes.filter((i) => i.source === 'OPEN_FINANCE_BANK')).toHaveLength(3);
    expect(res2.counts.incomesRelinked ?? 0).toBe(0);
  });

  it('S95-T10: provento equivalente já lançado é reaproveitado em vez de duplicado', async () => {
    await openFinanceRepository.addItem('item-6ef1');
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Corretora 6ef1', docket_code: '6EF1' });
    await setupBankEntries();
    const manual = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'MXRF11',
      payDate: '2026-01-15',
      amount: '60.60',
      kind: 'RENDIMENTO',
      source: 'B3',
    } as any);

    await pluggyInvestmentsSyncService.syncInvestments('item-6ef1', {
      client: makeMockClient([MXRF11, MXRF13], {}),
      defaultPortfolioId: portfolio.id,
    });

    const db = getDatabase();
    const jan = (await db.select().from(finEntries).where(eq(finEntries.external_id, 'bank-mxrf-2026-01')))[0];
    expect(jan.linked_income_id).toBe(manual.id);
    const allIncomes = await db.select().from(incomeEvents);
    expect(allIncomes.filter((i) => i.pay_date === '2026-01-15' && i.ticker === 'MXRF11')).toHaveLength(1);
  });
});
