import { getDatabase, resetDatabase } from '../../../db/client';
import { finEntries, incomeEvents } from '../../../db/schema';
import { assetRepository } from '../../../repositories/assetRepository';
import { finRepository } from '../../../repositories/finRepository';
import { incomeRepository } from '../../../repositories/incomeRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { pluggyDiagnosticsService } from '../pluggyDiagnosticsService';
import { pluggySyncService } from '../pluggySyncService';
import {
  makePluggyAccounts,
  makePluggyItem,
  makeSprint84OpenApiInvestment,
} from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';
import type { PluggyTransaction } from '../types';

describe('Sprint 90 — Proventos por nome e diagnóstico estendido (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S90-T03 (sync): dois ativos compatíveis incrementam ambiguousIncomeCount = 1 e não criam provento (R15)', async () => {
    await openFinanceRepository.addItem('item-s90-amb');
    const port = await portfolioRepository.createPortfolio({
      name: 'Corretora Amb',
      docket_code: 'AMB1',
      of_item_id: 'item-s90-amb',
    });
    await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'FII',
      ticker: 'HGLG11',
      name: 'CSHG LOGISTICA FII',
      quantity: '10',
      average_price: '160.00000000',
      source: 'OPEN_FINANCE',
      institution_id: 'item-s90-amb',
      of_status: 'ACTIVE',
    });
    await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'FII',
      ticker: 'HGRU11',
      name: 'CSHG RENDA URBANA FII',
      quantity: '10',
      average_price: '120.00000000',
      source: 'OPEN_FINANCE',
      institution_id: 'item-s90-amb',
      of_status: 'ACTIVE',
    });

    const checking = makePluggyAccounts()[0];
    const bankTx: PluggyTransaction = {
      id: 'tx-amb-1',
      description: 'RENDIMENTOS - À VISTA s/ FII CSHG',
      currencyCode: 'BRL',
      amount: 50.0,
      date: '2026-11-14T12:00:00Z',
      type: 'CREDIT',
      status: 'POSTED',
      category: 'Investments',
      categoryId: '03060000',
      accountId: checking.id,
      createdAt: '2026-11-14T12:00:00Z',
      updatedAt: '2026-11-14T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-s90-amb' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-s90-amb' }],
      listTransactions: async () => [bankTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    const result = await pluggySyncService.syncFinance('item-s90-amb', { client });
    expect(result.counts.ambiguousIncomeCount).toBe(1);

    const incomes = await incomeRepository.listAll();
    expect(incomes).toHaveLength(0);
  });

  it('S90-T07: VISC11 com INTEREST e crédito bancário do mesmo valor e data => um único income_event vinculado (D19, R15)', async () => {
    await openFinanceRepository.addItem('item-s90-visc');
    const port = await portfolioRepository.createPortfolio({
      name: 'Corretora B',
      docket_code: 'CB01',
      of_item_id: 'item-s90-visc',
    });
    const asset = await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'FII',
      ticker: 'VISC11',
      name: 'VINCI SHOPPING CENTERS FII',
      quantity: '50',
      average_price: '100.00000000',
      source: 'OPEN_FINANCE',
      institution_id: 'item-s90-visc',
      of_status: 'ACTIVE',
    });

    const existingInterest = await incomeRepository.addIncome({
      portfolioId: port.id,
      ticker: 'VISC11',
      payDate: '2026-11-14',
      amount: '45.00',
      kind: 'RENDIMENTO',
      source: 'OPEN_FINANCE',
      externalId: 'pluggy:int-visc-45',
      itemId: 'item-s90-visc',
      assetId: asset.id,
    });

    const checking = makePluggyAccounts()[0];
    const bankTx: PluggyTransaction = {
      id: 'tx-visc-bank-45',
      description: 'RENDIMENTOS - À VISTA s/ FII VINCI SC',
      currencyCode: 'BRL',
      amount: 45.0,
      date: '2026-11-14T12:00:00Z',
      type: 'CREDIT',
      status: 'POSTED',
      category: 'Investments',
      categoryId: '03060000',
      accountId: checking.id,
      createdAt: '2026-11-14T12:00:00Z',
      updatedAt: '2026-11-14T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-s90-visc' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-s90-visc' }],
      listTransactions: async () => [bankTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-s90-visc', { client });

    const db = getDatabase();
    const incomes = await db.select().from(incomeEvents);
    expect(incomes).toHaveLength(1);

    const entries = await db.select().from(finEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].linked_income_id).toBe(existingInterest.id);
  });

  it('S90-T09: export inclui app e name por investimento e entriesLast90d por conta, sem PII nem nome do titular (D25, R21)', async () => {
    const itemId = 'item-s90-diag';
    await openFinanceRepository.addItem(itemId);
    const port = await portfolioRepository.createPortfolio({
      name: 'Corretora Diag',
      docket_code: 'DG01',
      of_item_id: itemId,
    });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-s90-visc',
      itemId,
      type: 'EQUITY',
      subtype: 'REAL_ESTATE_FUND',
      code: 'VISC11',
      name: 'VINCI SHOPPING CENTERS FII',
      quantity: 10,
      balance: 1050,
      owner: 'PEDRO GABRIEL DE SOUSA',
      number: '77665544',
    });

    const asset = await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'FII',
      ticker: 'VISC11',
      name: 'Vinci Shopping Centers FII',
      quantity: '10',
      average_price: '100.00000000',
      cost_basis_source: 'TRANSACTIONS',
      value_source: 'INSTITUTION',
      of_reported_value: '1050.00',
      source: 'OPEN_FINANCE',
      external_id: 'inv-s90-visc',
      institution_id: itemId,
      of_status: 'ACTIVE',
    });

    await incomeRepository.addIncome({
      portfolioId: port.id,
      ticker: 'VISC11',
      payDate: new Date().toISOString().slice(0, 10),
      amount: '10.00',
      kind: 'RENDIMENTO',
      source: 'OPEN_FINANCE',
      externalId: 'pluggy:int-diag-1',
      itemId,
      assetId: asset.id,
    });

    const acc = {
      ...makePluggyAccounts()[0],
      id: 'acc-s90-diag',
      itemId,
      owner: 'PEDRO GABRIEL DE SOUSA',
      taxNumber: '111.222.333-44',
      number: '14459415',
    };

    const localAcc = await finRepository.createAccount({
      name: 'Conta Diag',
      type: 'checking',
      initial_balance_cents: 0,
      color: '#000000',
      of_account_id: acc.id,
      source: 'OPEN_FINANCE',
    });

    const todayIso = new Date().toISOString().slice(0, 10);
    await finRepository.createEntry({
      kind: 'expense',
      amount_cents: 5000,
      due_date: todayIso,
      paid_date: todayIso,
      paid_amount_cents: 5000,
      status: 'paid',
      account_id: localAcc.id,
      category_id: 'cat-outros-despesa',
      description: 'Compra',
      source: 'OPEN_FINANCE',
      external_id: 'of-diag-e1',
    });
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 10000,
      due_date: todayIso,
      paid_date: todayIso,
      paid_amount_cents: 10000,
      status: 'paid',
      account_id: localAcc.id,
      category_id: 'cat-salario',
      description: 'Salário',
      source: 'OPEN_FINANCE',
      external_id: 'of-diag-e2',
    });

    const sampleTx: PluggyTransaction = {
      id: 'tx-diag-pii',
      description: 'Pix enviado para Pedro Gabriel de Sousa 14459415',
      currencyCode: 'BRL',
      amount: -100,
      date: `${todayIso}T12:00:00Z`,
      type: 'DEBIT',
      status: 'POSTED',
      category: 'Same person transfer',
      categoryId: '04000000',
      accountId: acc.id,
      createdAt: `${todayIso}T12:00:00Z`,
      updatedAt: `${todayIso}T12:00:00Z`,
    };

    const client = {
      getItem: async () => makePluggyItem({ id: itemId }),
      listAccounts: async () => [acc],
      listTransactions: async () => [sampleTx],
      listBills: async () => [],
      listInvestments: async () => [inv],
      listInvestmentTransactions: async () => [],
    } as unknown as PluggyClient;

    const report = await pluggyDiagnosticsService.generateAnonymizedPluggyDiagnostics({
      client,
      itemIds: [itemId],
    });

    const json = JSON.stringify(report);
    expect(json).not.toContain(itemId);
    expect(json).not.toContain('PEDRO GABRIEL DE SOUSA');
    expect(json.toLowerCase()).not.toContain('pedro');
    expect(json).not.toContain('111.222.333-44');
    expect(json).not.toContain('14459415');

    const diagInv = report.items[0].investments[0] as any;
    expect(diagInv.name).toBe('VINCI SHOPPING CENTERS FII');
    expect(diagInv.app).toBeDefined();
    expect(diagInv.app.hasAveragePrice).toBe(true);
    expect(diagInv.app.costBasisSource).toBe('TRANSACTIONS');
    expect(diagInv.app.valueSource).toBe('INSTITUTION');
    expect(diagInv.app.displayedValue).toBe('1050.00');
    expect(diagInv.app.incomeCount12m).toBe(1);

    const diagAcc = report.items[0].accounts[0] as any;
    expect(diagAcc.entriesLast90d).toBeDefined();
    expect(diagAcc.entriesLast90d.total).toBe(2);
    expect(diagAcc.entriesLast90d.byKind.expense).toBe(1);
    expect(diagAcc.entriesLast90d.byKind.income).toBe(1);
    expect(diagAcc.entriesLast90d.outrosPct).toBe(50);
  });
});
