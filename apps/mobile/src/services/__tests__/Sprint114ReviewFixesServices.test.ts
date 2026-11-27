import { eq } from 'drizzle-orm';
import { getDatabase, initializeDatabase } from '../../db/client';
import { assets, finAccounts, finEntries, incomeEvents, portfolios, transactions } from '../../db/schema';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { b3ImportService } from '../b3ImportService';
import { finService } from '../finService';
import { monthCloseService } from '../monthCloseService';
import { patrimonyService } from '../patrimonyService';
import type { PluggyClient } from '../pluggy/pluggyClient';
import { pluggySyncService } from '../pluggy/pluggySyncService';
import { makePluggyAccounts, makePluggyItem } from '../pluggy/__tests__/pluggyFixtures';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { transactionService } from '../transactionService';

describe('Sprint 114 — Serviços e Migrações (P2, P3b/c/d, P5, P6a/b, P7)', () => {
  beforeEach(async () => {
    await initializeDatabase();
    const db = getDatabase();
    await db.delete(finEntries);
    await db.delete(incomeEvents);
    await db.delete(transactions);
    await db.delete(assets);
    await db.delete(portfolios);
    await db.delete(finAccounts);
  });

  test('S114-T06 (P2): importação B3 não lança em Finanças; undo B3 limpa fin_entries; migração remove-b3-import-cash-entries:v1 remove só os de B3', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora B3',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira B3',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    // 1. executeTransaction com source B3_IMPORT não cria fin_entries
    const b3Tx = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-09-10',
      quantity: '10',
      unitPrice: '30.00',
      source: 'B3_IMPORT',
      externalId: 'b3-ext-1',
    });
    const entriesAfterB3 = await finRepository.listAllEntries();
    expect(entriesAfterB3.filter((e) => e.linked_transaction_id === b3Tx.transaction.id)).toHaveLength(0);

    // 2. Migração remove-b3-import-cash-entries:v1 remove fin_entries ligados a B3_IMPORT mas preserva MANUAL
    const manualTx = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-09-12',
      quantity: '5',
      unitPrice: '32.00',
      source: 'MANUAL',
    });
    // Simula entrada legada de B3_IMPORT gravada antes da Sprint 114
    await finRepository.createEntry({
      kind: 'investment_buy',
      amount_cents: 30_000,
      due_date: '2026-09-10',
      paid_date: '2026-09-10',
      paid_amount_cents: 30_000,
      status: 'paid',
      account_id: broker.id,
      category_id: 'cat-outros-despesa',
      description: 'Compra legado B3',
      linked_transaction_id: b3Tx.transaction.id,
    });

    const removed = await (finService as any).migrateRemoveB3ImportCashEntriesIfNeeded();
    expect(removed).toBeGreaterThanOrEqual(1);
    const afterMig = await finRepository.listAllEntries();
    expect(afterMig.some((e) => e.linked_transaction_id === b3Tx.transaction.id)).toBe(false);
    expect(afterMig.some((e) => e.linked_transaction_id === manualTx.transaction.id)).toBe(true);

    // Idempotente na segunda chamada
    const removedSecond = await (finService as any).migrateRemoveB3ImportCashEntriesIfNeeded();
    expect(removedSecond).toBe(0);

    // 3. Desfazer importação B3 remove transação B3 e recalcula posição para apenas a compra MANUAL (5 cotas)
    await b3ImportService.undoB3Import(portfolio.id);
    const updatedAsset = await assetRepository.getAssetById(asset.id);
    expect(Number(updatedAsset?.quantity)).toBe(5);
    expect(Number(updatedAsset?.average_price)).toBeCloseTo(32, 2);
  });

  test('S114-T07 (P3b/c/d): compra na corrente casa saída OF sem duplicar; migrateBrokerLinkSuggestV2 troca para conta OF; patrimonyService não conta checking duas vezes', async () => {
    await openFinanceRepository.addItem('item-itau');
    const pgChecking = {
      ...makePluggyAccounts()[0],
      id: 'pg-itau-cc',
      name: 'Itaú CC',
      itemId: 'item-itau',
      balance: 2000,
    };
    await pluggySyncService.syncFinance('item-itau', {
      client: {
        getItem: async () => makePluggyItem({ id: 'item-itau' }),
        listAccounts: async () => [pgChecking],
        listTransactions: async () => [],
        listBills: async () => [],
      } as unknown as PluggyClient,
      now: () => new Date('2026-10-10T12:00:00Z'),
    });
    const checking = (await finRepository.listAccounts(true)).find(
      (a) => a.of_account_id === 'pg-itau-cc'
    )!;
    const broker = await finRepository.createAccount({
      name: 'Itaú Corretora',
      type: 'broker',
      initialBalanceCents: 0,
    });

    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Itaú',
      targetReturn: '12',
      ofItemId: 'item-itau',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    // P3c: migração v2 troca para conta OF da mesma conexão e arquiva corretora vazia
    const migratedCount = await (finService as any).migrateBrokerLinkSuggestV2IfNeeded();
    expect(migratedCount).toBe(1);
    const reloadedPortfolio = await portfolioRepository.getPortfolioById(portfolio.id);
    expect(reloadedPortfolio?.fin_account_id).toBe(checking.id);
    const db = getDatabase();
    const [archivedBroker] = await db.select().from(finAccounts).where(eq(finAccounts.id, broker.id));
    expect(archivedBroker.archived).toBe(1);

    // P3d: conta checking vinculada continua em accountsCents (não entra em investedCents)
    const pat = await patrimonyService.getPatrimony('2026-10-10');
    expect(pat.accountsCents).toBe(200_000);
    expect(pat.investedCents).toBe(0);

    // P3b: compra em carteira vinculada a corretora usando cashSource = checking casa saída OF existente
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    await db.update(finAccounts).set({ archived: 0 }).where(eq(finAccounts.id, broker.id));
    await appMetaRepository.delete(`broker-link:manual:${portfolio.id}`);

    const ofOutflow = await finRepository.createEntry({
      kind: 'expense',
      source: 'OPEN_FINANCE',
      of_class_reason: 'INVESTMENT_MOVE',
      account_id: checking.id,
      amount_cents: 50_000,
      due_date: '2026-10-08',
      paid_date: '2026-10-08',
      paid_amount_cents: 50_000,
      status: 'paid',
      category_id: 'cat-outros-despesa',
      description: 'TED Corretora',
    });

    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const buyRes = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-10-10',
      quantity: '10',
      unitPrice: '50.00',
      source: 'MANUAL',
      cashSource: { accountId: checking.id },
    });

    const allEntries = await finRepository.listAllEntries();
    const transferOuts = allEntries.filter(
      (e) => e.account_id === checking.id && e.kind === 'transfer_out'
    );
    expect(transferOuts).toHaveLength(1);
    expect(transferOuts[0].id).toBe(ofOutflow.id);
    expect(transferOuts[0].linked_transaction_id).toBe(buyRes.transaction.id);
    expect(
      allEntries.some(
        (e) =>
          e.account_id === broker.id &&
          e.kind === 'transfer_in' &&
          e.transfer_group_id === transferOuts[0].transfer_group_id
      )
    ).toBe(true);
    expect(
      allEntries.some(
        (e) =>
          e.account_id === broker.id &&
          e.kind === 'investment_buy' &&
          e.linked_transaction_id === buyRes.transaction.id
      )
    ).toBe(true);
  });

  test('S114-T08 (P5): deleteTransaction recalcula quantidade e preço médio do ativo a partir das movimentações restantes', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Principal',
      targetReturn: '12',
    });
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'BBAS3',
      name: 'Banco do Brasil',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const tx1 = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-10-01',
      quantity: '10',
      unitPrice: '20.00',
      source: 'MANUAL',
    });
    const tx2 = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-10-02',
      quantity: '10',
      unitPrice: '30.00',
      source: 'MANUAL',
    });

    // Antes de excluir: 20 cotas @ PM 25.00
    let current = await assetRepository.getAssetById(asset.id);
    expect(Number(current?.quantity)).toBe(20);
    expect(Number(current?.average_price)).toBeCloseTo(25, 2);

    // Exclui tx2: deve voltar para 10 cotas @ PM 20.00
    await transactionService.deleteTransaction(tx2.transaction.id);
    current = await assetRepository.getAssetById(asset.id);
    expect(Number(current?.quantity)).toBe(10);
    expect(Number(current?.average_price)).toBeCloseTo(20, 2);

    // Exclui tx1: deve zerar posição
    await transactionService.deleteTransaction(tx1.transaction.id);
    current = await assetRepository.getAssetById(asset.id);
    expect(Number(current?.quantity)).toBe(0);
    expect(Number(current?.average_price)).toBe(0);
  });

  test('S114-T09 (P6a/b): addIncome atômico e updateIncome atualiza investment_income ligado sem sobrescrever crédito OF', async () => {
    const broker = await finRepository.createAccount({
      name: 'Clear',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Clear',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    // 1. Provento manual gera investment_income; updateIncome atualiza valor e data
    const inc = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'MXRF11',
      payDate: '2026-10-10',
      amount: '50.00',
      kind: 'RENDIMENTO',
    });
    await incomeRepository.updateIncome(inc.id, {
      amount: '65.00',
      payDate: '2026-10-12',
    });

    const entries1 = await finRepository.listAllEntries();
    const linked1 = entries1.find((e) => e.linked_income_id === inc.id);
    expect(linked1?.kind).toBe('investment_income');
    expect(linked1?.amount_cents).toBe(6500);
    expect(linked1?.due_date).toBe('2026-10-12');

    // 2. Provento casado com Open Finance não tem o valor pago sobrescrito em updateIncome
    const ofEntry = await finRepository.createEntry({
      kind: 'income',
      source: 'OPEN_FINANCE',
      account_id: broker.id,
      amount_cents: 8500,
      due_date: '2026-10-15',
      paid_date: '2026-10-15',
      paid_amount_cents: 8500,
      status: 'paid',
      category_id: 'cat-outros-receita',
      description: 'JCP ITUB4',
    });
    const incOf = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'ITUB4',
      payDate: '2026-10-15',
      amount: '100.00',
      kind: 'JCP',
    });
    await incomeRepository.updateIncome(incOf.id, {
      amount: '120.00',
      payDate: '2026-10-16',
    });

    const entries2 = await finRepository.listAllEntries();
    const ofAfter = entries2.find((e) => e.id === ofEntry.id);
    expect(ofAfter?.linked_income_id).toBe(incOf.id);
    expect(ofAfter?.amount_cents).toBe(8500); // OF prevalece!
  });

  test('S114-T10 (P7): monthCloseService usa valor por ativo vindo de patrimonyService (fonte única R42)', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'RF',
      targetReturn: '12',
    });
    const rfAsset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'TESOURO SELIC',
      name: 'Tesouro Selic',
      asset_class: 'FIXED_INCOME',
      quantity: '1',
      average_price: '1000.00',
      rf_daily_liquidity: 1,
    });

    const spy = jest.spyOn(patrimonyService, 'getPatrimony').mockResolvedValue({
      investedCents: 150_000,
      accountsCents: 0,
      cardsCents: 0,
      totalCents: 150_000,
      byPortfolio: [
        {
          portfolioId: portfolio.id,
          name: 'RF',
          marketValueCents: 150_000,
          byClassCents: { FIXED_INCOME: 150_000 },
          annualReturnPercent: 0,
        },
      ],
      byAccount: [],
      byAsset: [
        {
          assetId: rfAsset.id,
          portfolioId: portfolio.id,
          ticker: 'TESOURO SELIC',
          assetClass: 'FIXED_INCOME',
          marketValueCents: 150_000,
        },
      ],
    } as any);

    const proposal = await monthCloseService.getProposal('2026-10', { todayIso: '2026-10-25' });
    expect(spy).toHaveBeenCalled();
    expect(proposal.liquidFixedIncomeCents).toBe(150_000);
    spy.mockRestore();
  });
});
