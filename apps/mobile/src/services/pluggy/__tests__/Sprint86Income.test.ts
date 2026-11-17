import { resetDatabase, getDatabase } from '../../../db/client';
import { assets, incomeEvents } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { PluggyClient } from '../pluggyClient';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { incomeRepository } from '../../../repositories/incomeRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import {
  FAKE_PLUGGY_CREDENTIALS,
  makePluggyItem,
  makeSprint84OpenApiInvestment,
  makeSprint84OpenApiInvestmentTx,
} from './pluggyFixtures';
import type { PluggyInvestment, PluggyInvestmentTransaction } from '../types';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      map.set(k, v);
    },
    deleteItem: async (k: string) => {
      map.delete(k);
    },
  };
}

describe('Sprint 86 — Proventos completos e resiliência (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S86-T01: 429, 429, 200 na rota de transações => proventos gravados e run SUCCESS (D10, R8)', async () => {
    await openFinanceRepository.addItem('item-retry');
    const port = await portfolioRepository.createPortfolio({ name: 'Corretora Retry', docket_code: 'CR01' });

    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-fii-retry',
      itemId: 'item-retry',
      type: 'EQUITY',
      subtype: 'REAL_ESTATE_FUND',
      code: 'HGLG11',
      name: 'CSHG LOGISTICA FII',
      quantity: 10,
      balance: 1600,
      amountOriginal: 1500,
    });
    const interestTx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-int-retry',
      type: 'INTEREST',
      movementType: 'CREDIT',
      amount: 11.0,
      netAmount: 11.0,
      date: '2026-10-15T00:00:00Z',
      description: 'RENDIMENTO HGLG11',
    });

    let txCalls = 0;
    const storage = createMemoryStorage();
    await storage.setItem('pluggy.client_id', FAKE_PLUGGY_CREDENTIALS.clientId);
    await storage.setItem('pluggy.client_secret', FAKE_PLUGGY_CREDENTIALS.clientSecret);
    await storage.setItem('pluggy.api_key', 'fake-api-key');
    await storage.setItem('pluggy.api_key_expires_at', String(Date.now() + 3600_000));

    const fetchImpl = (async (url: string) => {
      if (url.includes('/items/')) {
        return { ok: true, status: 200, json: async () => makePluggyItem({ id: 'item-retry' }) } as Response;
      }
      if (url.includes('/investments/inv-fii-retry/transactions')) {
        txCalls += 1;
        if (txCalls <= 2) {
          return {
            ok: false,
            status: 429,
            headers: { get: () => '0' },
            json: async () => ({}),
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ page: 1, total: 1, totalPages: 1, results: [interestTx] }),
        } as Response;
      }
      if (url.includes('/investments?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ page: 1, total: 1, totalPages: 1, results: [inv] }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const client = new PluggyClient({
      fetchImpl,
      storage,
      baseDelayMs: 1,
      maxRetries: 2,
    });

    const result = await pluggyInvestmentsSyncService.syncInvestments('item-retry', {
      client,
      defaultPortfolioId: port.id,
    });

    expect(txCalls).toBe(3);
    expect(result.status).toBe('SUCCESS');
    const incomes = await incomeRepository.listAll();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].amount).toBe('11.00');
  });

  it('S86-T02: falha persistente em 1 de 3 investimentos => run PARTIAL, failedInvestmentIds com 1 id, custo antigo mantido (D10, R8)', async () => {
    await openFinanceRepository.addItem('item-partial');
    const port = await portfolioRepository.createPortfolio({ name: 'Corretora Parcial', docket_code: 'CP01' });

    await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'STOCK',
      ticker: 'VALE3',
      name: 'Vale ON',
      quantity: '100',
      average_price: '65.00000000',
      cost_basis_source: 'TRANSACTIONS',
      source: 'OPEN_FINANCE',
      external_id: 'inv-fail',
      institution_id: 'item-partial',
    });

    const inv1 = makeSprint84OpenApiInvestment({ id: 'inv-ok-1', itemId: 'item-partial', type: 'EQUITY', subtype: 'STOCK', code: 'PETR4', quantity: 100, balance: 3800, amountOriginal: 3000 });
    const inv2 = makeSprint84OpenApiInvestment({ id: 'inv-fail', itemId: 'item-partial', type: 'EQUITY', subtype: 'STOCK', code: 'VALE3', quantity: 100, balance: 6200, amountOriginal: null });
    const inv3 = makeSprint84OpenApiInvestment({ id: 'inv-ok-2', itemId: 'item-partial', type: 'EQUITY', subtype: 'STOCK', code: 'ITUB4', quantity: 50, balance: 1700, amountOriginal: 1500 });

    const client = {
      getItem: async (id: string) => makePluggyItem({ id }),
      listInvestments: async () => [inv1, inv2, inv3],
      listInvestmentTransactions: async (invId: string) => {
        if (invId === 'inv-fail') throw new Error('429 Too Many Requests');
        return [];
      },
    } as unknown as PluggyClient;

    const result = await pluggyInvestmentsSyncService.syncInvestments('item-partial', {
      client,
      defaultPortfolioId: port.id,
    });

    expect(result.status).toBe('PARTIAL');
    expect((result.counts as any).failedInvestmentIds).toEqual(['inv-fail']);

    const db = getDatabase();
    const [vale] = await db.select().from(assets).where(eq(assets.external_id, 'inv-fail'));
    expect(vale.average_price).toBe('65.00000000');
    expect(vale.cost_basis_source).toBe('TRANSACTIONS');
  });

  it('S86-T03 & S86-T04: investimento com match MEDIUM não grava ativo mas grava INTEREST na carteira da corretora, e migra ao confirmar reconciliação (D11, R8)', async () => {
    await openFinanceRepository.addItem('item-med');
    const chosenPort = await portfolioRepository.createPortfolio({ name: 'Carteira Escolhida', docket_code: 'CE01' });

    // Ativo manual RF que dará match MEDIUM por FIXED_INCOME_KEY
    const manualCdb = await assetRepository.createAsset({
      portfolio_id: chosenPort.id,
      asset_class: 'FIXED_INCOME',
      ticker: 'CDB XYZ',
      name: 'CDB Banco XYZ',
      quantity: '1',
      average_price: '10000.00000000',
      rf_indexer: 'CDI',
      rf_rate: 110,
      rf_issuer: 'Banco XYZ',
      rf_maturity_date: '2028-05-01',
      source: 'MANUAL',
    });

    const invMed = makeSprint84OpenApiInvestment({
      id: 'inv-cdb-med',
      itemId: 'item-med',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      name: 'CDB Banco XYZ',
      issuer: 'Banco XYZ',
      dueDate: '2028-05-01',
      rateType: 'CDI',
      rate: 110,
      quantity: 1,
      balance: 10500,
      amountOriginal: 10000,
    });
    const interestTx = makeSprint84OpenApiInvestmentTx({
      id: 'tx-int-med',
      type: 'INTEREST',
      movementType: 'CREDIT',
      amount: 85.5,
      netAmount: 85.5,
      date: '2026-10-01T00:00:00Z',
      description: 'Rendimento CDB Banco XYZ',
    });

    const client = {
      getItem: async (id: string) => makePluggyItem({ id, connector: { id: 1, name: 'Corretora Med' } }),
      listInvestments: async () => [invMed],
      listInvestmentTransactions: async () => [interestTx],
    } as unknown as PluggyClient;

    // 1o sync sem reconciliationChoices -> needsReconciliation true, mas provento já é gravado na carteira da corretora
    const res1 = await pluggyInvestmentsSyncService.syncInvestments('item-med', { client });
    expect(res1.needsReconciliation).toBe(true);

    let incomes = await incomeRepository.listAll();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].amount).toBe('85.50');
    expect((incomes[0] as any).asset_id).toBeNull();
    expect((incomes[0] as any).item_id).toBe('item-med');

    // S86-T04: confirmar reconciliação -> provento migra para a carteira escolhida
    await pluggyInvestmentsSyncService.syncInvestments('item-med', {
      client,
      reconciliationChoices: [
        {
          pluggyInvestmentId: 'inv-cdb-med',
          action: 'MATCH',
          targetAssetId: manualCdb.id,
          targetPortfolioId: chosenPort.id,
        },
      ],
    });

    incomes = await incomeRepository.listAll();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].portfolio_id).toBe(chosenPort.id);
    expect((incomes[0] as any).asset_id).toBe(manualCdb.id);
  });

  it('S86-T05: disconnect do item A não apaga proventos do item B com o mesmo ticker e carteira (D13, R8)', async () => {
    await openFinanceRepository.addItem('item-A');
    await openFinanceRepository.addItem('item-B');
    const sharedPort = await portfolioRepository.createPortfolio({ name: 'Carteira Compartilhada', docket_code: 'CC01' });

    const invA = makeSprint84OpenApiInvestment({
      id: 'inv-petr-A',
      itemId: 'item-A',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      quantity: 100,
      balance: 3800,
      amountOriginal: 3000,
    });
    const invB = makeSprint84OpenApiInvestment({
      id: 'inv-petr-B',
      itemId: 'item-B',
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      quantity: 200,
      balance: 7600,
      amountOriginal: 6000,
    });

    const intA = makeSprint84OpenApiInvestmentTx({
      id: 'tx-int-A',
      type: 'INTEREST',
      movementType: 'CREDIT',
      amount: 100,
      netAmount: 100,
      date: '2026-09-10T00:00:00Z',
      description: 'Dividendo PETR4 A',
    });
    const intB = makeSprint84OpenApiInvestmentTx({
      id: 'tx-int-B',
      type: 'INTEREST',
      movementType: 'CREDIT',
      amount: 200,
      netAmount: 200,
      date: '2026-09-25T00:00:00Z',
      description: 'Dividendo PETR4 B',
    });

    await pluggyInvestmentsSyncService.syncInvestments('item-A', {
      client: {
        getItem: async (id: string) => makePluggyItem({ id }),
        listInvestments: async () => [invA],
        listInvestmentTransactions: async () => [intA],
      } as unknown as PluggyClient,
      defaultPortfolioId: sharedPort.id,
    });
    await pluggyInvestmentsSyncService.syncInvestments('item-B', {
      client: {
        getItem: async (id: string) => makePluggyItem({ id }),
        listInvestments: async () => [invB],
        listInvestmentTransactions: async () => [intB],
      } as unknown as PluggyClient,
      defaultPortfolioId: sharedPort.id,
    });

    expect(await incomeRepository.listAll()).toHaveLength(2);

    await pluggyInvestmentsSyncService.disconnectItemInvestments('item-A');

    const remaining = await incomeRepository.listAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].amount).toBe('200.00');
    expect((remaining[0] as any).item_id).toBe('item-B');
  });
});
