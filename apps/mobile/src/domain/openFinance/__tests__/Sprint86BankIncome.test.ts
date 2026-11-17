import { resetDatabase, getDatabase } from '../../../db/client';
import { finEntries, incomeEvents } from '../../../db/schema';
import { detectBankIncomeCandidate } from '../income';
import { pluggySyncService } from '../../../services/pluggy/pluggySyncService';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { incomeRepository } from '../../../repositories/incomeRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { makePluggyAccounts, makePluggyItem } from '../../../services/pluggy/__tests__/pluggyFixtures';
import type { PluggyClient } from '../../../services/pluggy/pluggyClient';
import type { PluggyTransaction } from '../../../services/pluggy/types';

describe('Sprint 86 — Proventos via conta da corretora (Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S86-T06: crédito bancário "DIVIDENDOS PETR4" R$ 120 => provento OPEN_FINANCE_BANK e fin_entries.linked_income_id (D12, R9)', async () => {
    const candidate = detectBankIncomeCandidate(
      {
        id: 'bank-tx-1',
        type: 'CREDIT',
        amount: 120,
        date: '2026-10-15T12:00:00Z',
        description: 'DIVIDENDOS PETR4',
        category: 'Proceeds interests and dividends',
        categoryId: '04070000',
      },
      new Set(['PETR4', 'HGLG11'])
    );
    expect(candidate).not.toBeNull();
    expect(candidate!.ticker).toBe('PETR4');
    expect(candidate!.amount).toBe('120.00');
    expect(candidate!.kind).toBe('DIVIDENDO');
    expect(candidate!.source).toBe('OPEN_FINANCE_BANK');

    await openFinanceRepository.addItem('item-bank-inc');
    const port = await portfolioRepository.createPortfolio({
      name: 'Corretora XP',
      docket_code: 'XP01',
      of_item_id: 'item-bank-inc',
    });
    await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      quantity: '100',
      average_price: '30.00000000',
      source: 'OPEN_FINANCE',
      institution_id: 'item-bank-inc',
    });

    const checking = makePluggyAccounts()[0];
    const bankTx: PluggyTransaction = {
      id: 'bank-tx-1',
      description: 'DIVIDENDOS PETR4',
      currencyCode: 'BRL',
      amount: 120,
      date: '2026-10-15T12:00:00Z',
      type: 'CREDIT',
      status: 'POSTED',
      category: 'Proceeds interests and dividends',
      categoryId: '04070000',
      accountId: checking.id,
      createdAt: '2026-10-15T12:00:00Z',
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-bank-inc' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-bank-inc' }],
      listTransactions: async () => [bankTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-bank-inc', { client });

    const incomes = await incomeRepository.listAll();
    expect(incomes).toHaveLength(1);
    expect(incomes[0].source).toBe('OPEN_FINANCE_BANK');
    expect(incomes[0].ticker).toBe('PETR4');
    expect(incomes[0].amount).toBe('120.00');

    const db = getDatabase();
    const entries = await db.select().from(finEntries);
    expect(entries).toHaveLength(1);
    expect((entries[0] as any).linked_income_id).toBe(incomes[0].id);
  });

  it('S86-T07: o mesmo dividendo também vindo como INTEREST => um provento só (R9)', async () => {
    await openFinanceRepository.addItem('item-dedup');
    const port = await portfolioRepository.createPortfolio({
      name: 'Corretora Dedup',
      docket_code: 'DD01',
      of_item_id: 'item-dedup',
    });
    await assetRepository.createAsset({
      portfolio_id: port.id,
      asset_class: 'STOCK',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      quantity: '100',
      average_price: '30.00000000',
      source: 'OPEN_FINANCE',
      institution_id: 'item-dedup',
    });
    const existingInterest = await incomeRepository.addIncome({
      portfolioId: port.id,
      ticker: 'PETR4',
      payDate: '2026-10-15',
      amount: '120.00',
      kind: 'DIVIDENDO',
      source: 'OPEN_FINANCE',
      externalId: 'pluggy:int-120',
    });

    const checking = makePluggyAccounts()[0];
    const bankTx: PluggyTransaction = {
      id: 'bank-tx-dup-120',
      description: 'DIVIDENDOS PETR4',
      currencyCode: 'BRL',
      amount: 120,
      date: '2026-10-15T12:00:00Z',
      type: 'CREDIT',
      status: 'POSTED',
      category: 'Proceeds interests and dividends',
      accountId: checking.id,
      createdAt: '2026-10-15T12:00:00Z',
      updatedAt: '2026-10-15T12:00:00Z',
    };

    const client = {
      getItem: async () => makePluggyItem({ id: 'item-dedup' }),
      listAccounts: async () => [{ ...checking, itemId: 'item-dedup' }],
      listTransactions: async () => [bankTx],
      listBills: async () => [],
    } as unknown as PluggyClient;

    await pluggySyncService.syncFinance('item-dedup', { client });

    const db = getDatabase();
    const incomes = await db.select().from(incomeEvents);
    expect(incomes).toHaveLength(1);
    const entries = await db.select().from(finEntries);
    expect((entries[0] as any).linked_income_id).toBe(existingInterest.id);
  });

  it('S86-T08: crédito "RENDIMENTO POUPANÇA" sem ticker conhecido => não vira provento (R9)', () => {
    const candidate = detectBankIncomeCandidate(
      {
        id: 'bank-tx-poup',
        type: 'CREDIT',
        amount: 25.4,
        date: '2026-10-15T12:00:00Z',
        description: 'RENDIMENTO POUPANÇA',
        category: 'Proceeds interests and dividends',
        categoryId: '04070000',
      },
      new Set(['PETR4', 'HGLG11'])
    );
    expect(candidate).toBeNull();
  });
});
