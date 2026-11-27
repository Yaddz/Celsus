import { eq } from 'drizzle-orm';
import { getDatabase, initializeDatabase, resetDatabase } from '../../db/client';
import { assets, finAccounts, finEntries, incomeEvents, ofItems, portfolios, transactions } from '../../db/schema';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { finService } from '../finService';
import { fireService } from '../fireService';
import { getInvestmentAccountIds } from '../investmentAccountsService';
import { monthCloseService } from '../monthCloseService';
import type { PluggyClient } from '../pluggy/pluggyClient';
import { pluggySyncService } from '../pluggy/pluggySyncService';
import { makePluggyAccounts, makePluggyItem } from '../pluggy/__tests__/pluggyFixtures';
import type { PluggyTransaction } from '../pluggy/types';
import { rebalanceExecutionService } from '../rebalanceExecution';
import { transactionService } from '../transactionService';

function makeClientForItem(
  itemId: string,
  txs: PluggyTransaction[] = [],
  accountOverrides?: Partial<ReturnType<typeof makePluggyAccounts>[0]>
): PluggyClient {
  const checking = {
    ...makePluggyAccounts()[0],
    id: `pg-acc-${itemId}`,
    itemId,
    balance: 2000.0,
    ...accountOverrides,
  };
  return {
    getItem: async () => makePluggyItem({ id: itemId }),
    listAccounts: async () => [checking],
    listTransactions: async () => txs,
    listBills: async () => [],
  } as unknown as PluggyClient;
}

describe('Sprint 115 — Serviços e Integração Pluggy (V1, V2, V3b, V4, V5, V6)', () => {
  beforeEach(async () => {
    resetDatabase();
    await initializeDatabase();
  });

  test('S115-T04 (V1a/b): sync grava of_item_id ao criar e atualizar; migração local deduz of_item_id quando possível e mantém null quando ambíguo', async () => {
    const itemId = 'item-v1-sync';
    await openFinanceRepository.addItem(itemId);

    // 1. Sincronização cria conta com of_item_id
    const client = makeClientForItem(itemId);
    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-15T12:00:00Z'),
    });

    const accountsAfterCreate = await finRepository.listAccounts(true);
    const createdAcc = accountsAfterCreate.find((a) => a.of_account_id === `pg-acc-${itemId}`);
    expect(createdAcc).toBeTruthy();
    expect(createdAcc?.of_item_id).toBe(itemId);

    // 2. Conta legada sem of_item_id recebe na sincronização seguinte
    const db = getDatabase();
    await db
      .update(finAccounts)
      .set({ of_item_id: null })
      .where(eq(finAccounts.id, createdAcc!.id));

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-16T12:00:00Z'),
    });
    const [updatedAcc] = await db
      .select()
      .from(finAccounts)
      .where(eq(finAccounts.id, createdAcc!.id));
    expect(updatedAcc.of_item_id).toBe(itemId);

    // 3. Migração local sem rede deduz quando há vínculo ou único item, e deixa null quando há múltiplos itens sem vínculo
    const item2 = 'item-v1-other';
    await openFinanceRepository.addItem(item2);
    await db.update(finAccounts).set({ of_item_id: null }).where(eq(finAccounts.id, createdAcc!.id));

    // Sem vínculo e com 2 of_items no banco => ambíguo, permanece null
    await appMetaRepository.delete('migration:fin-accounts-of-item-id:v1');
    await finService.migrateFinAccountsOfItemIdIfNeeded();
    const [ambiguousAcc] = await db
      .select()
      .from(finAccounts)
      .where(eq(finAccounts.id, createdAcc!.id));
    expect(ambiguousAcc.of_item_id).toBeNull();

    // Com carteira vinculada à conta e of_item_id na carteira => deduz localmente!
    const port = await portfolioRepository.createPortfolio({
      name: 'Itaú',
      targetReturn: '12',
      ofItemId: itemId,
    });
    await portfolioRepository.linkFinAccount(port.id, createdAcc!.id);
    await appMetaRepository.delete('migration:fin-accounts-of-item-id:v1');
    const fixedCount = await finService.migrateFinAccountsOfItemIdIfNeeded();
    expect(fixedCount).toBeGreaterThanOrEqual(1);
    const [deducedAcc] = await db
      .select()
      .from(finAccounts)
      .where(eq(finAccounts.id, createdAcc!.id));
    expect(deducedAcc.of_item_id).toBe(itemId);
  });

  test('S115-T05 (V1c + P6c): broker-link-suggest:v3 roda após sync bem-sucedida, respeita escolha manual e P6c casa provento na conta OF da conexão', async () => {
    const itemId = 'item-v1c';
    await openFinanceRepository.addItem(itemId);

    // Carteira Pluggy com broker vazia (simula v1 antes do sync)
    const emptyBroker = await finRepository.createAccount({
      name: 'Itaú Corretora',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Itaú',
      targetReturn: '12',
      ofItemId: itemId,
    });
    await portfolioRepository.linkFinAccount(portfolio.id, emptyBroker.id);

    // Sync cria conta OF da conexão e dispara v3 ao final
    const client = makeClientForItem(itemId);
    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-15T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const ofChecking = accounts.find((a) => a.of_account_id === `pg-acc-${itemId}`);
    expect(ofChecking?.of_item_id).toBe(itemId);

    const reloaded = await portfolioRepository.getPortfolioById(portfolio.id);
    expect(reloaded?.fin_account_id).toBe(ofChecking?.id);
    const v3Mark = await appMetaRepository.get(`broker-link-suggest:v3:${portfolio.id}`);
    expect(v3Mark).toBe('1');

    // Escolha manual protege contra v3
    const manualBroker = await finRepository.createAccount({
      name: 'Corretora Manual',
      type: 'broker',
      initialBalanceCents: 0,
    });
    await portfolioRepository.linkFinAccount(portfolio.id, manualBroker.id);
    await appMetaRepository.set(`broker-link:manual:${portfolio.id}`, '1');
    await appMetaRepository.delete(`broker-link-suggest:v3:${portfolio.id}`);

    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-16T12:00:00Z'),
    });
    const afterManual = await portfolioRepository.getPortfolioById(portfolio.id);
    expect(afterManual?.fin_account_id).toBe(manualBroker.id);

    // P6c: provento na carteira vinculada a manualBroker casa com crédito OF na conta OF da mesma conexão
    const ofDividendTx: PluggyTransaction = {
      id: 'tx-div-petr4',
      accountId: `pg-acc-${itemId}`,
      description: 'DIVIDENDO PETR4',
      currencyCode: 'BRL',
      amount: 150.0,
      date: '2026-10-15T12:00:00.000Z',
      type: 'CREDIT',
      status: 'POSTED',
      categoryId: '04070000',
      createdAt: '2026-10-15T12:00:00.000Z',
      updatedAt: '2026-10-15T12:00:00.000Z',
    };
    await pluggySyncService.syncFinance(itemId, {
      client: makeClientForItem(itemId, [ofDividendTx]),
      now: () => new Date('2026-10-16T12:00:00Z'),
    });
    // Cria lançamento OF equivalente na conta checking (caso categoryId gere income) e testa addIncome
    const inc = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'PETR4',
      payDate: '2026-10-15',
      amount: '150.00',
      kind: 'DIVIDENDO',
    });
    const allEntries = await finRepository.listAllEntries();
    const ofDivEntry = allEntries.find(
      (e) => e.account_id === ofChecking!.id && e.amount_cents === 15_000 && e.source === 'OPEN_FINANCE'
    );
    expect(ofDivEntry?.linked_income_id).toBe(inc.id);
    // Não duplicou investment_income na corretora manual
    const synthIncomes = allEntries.filter(
      (e) => e.kind === 'investment_income' && e.linked_income_id === inc.id
    );
    expect(synthIncomes).toHaveLength(0);
  });

  test('S115-T06 (V2): getInvestmentAccountIds inclui broker + checking vinculada (não arquivada) e iguala aportes em monthCloseService e fireService', async () => {
    const itemId = 'item-v2';
    await openFinanceRepository.addItem(itemId);
    await pluggySyncService.syncFinance(itemId, {
      client: makeClientForItem(itemId),
      now: () => new Date('2026-10-15T12:00:00Z'),
    });
    const accounts = await finRepository.listAccounts(true);
    const linkedChecking = accounts.find((a) => a.of_account_id === `pg-acc-${itemId}`)!;
    const mainChecking = await finRepository.createAccount({
      name: 'Conta Principal',
      type: 'checking',
      initialBalanceCents: 500_000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Itaú',
      targetReturn: '12',
      ofItemId: itemId,
    });
    await portfolioRepository.linkFinAccount(portfolio.id, linkedChecking.id);

    const invIds = await getInvestmentAccountIds();
    expect(invIds).toContain(linkedChecking.id);

    // Transferência da conta principal para a checking vinculada em 2026-09 (mês fechado para fireService)
    await finService.createTransfer({
      fromAccountId: mainChecking.id,
      toAccountId: linkedChecking.id,
      amountCents: 150_000,
      dateIso: '2026-09-10',
      description: 'Aporte carteira',
    });

    const closeProposal = await monthCloseService.getProposal('2026-09', {
      todayIso: '2026-10-15',
    });
    expect(closeProposal.summary.contributionCents).toBe(150_000);

    const fireCtx = await fireService.loadFireContext('2026-10-15');
    expect(fireCtx.averageContributionCents).toBe(150_000);
  });

  test('S115-T07 (V3b): rebalanceExecution casa saída OF para o total do lote e vincula à primeira compra; deleteTransaction desfaz tudo sem apagar OF', async () => {
    const itemId = 'item-v3b';
    await openFinanceRepository.addItem(itemId);
    const ofTx: PluggyTransaction = {
      id: 'tx-lote-of',
      accountId: `pg-acc-${itemId}`,
      description: 'TED CORRETORA',
      currencyCode: 'BRL',
      amount: -1000.0,
      date: '2026-10-10T12:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      categoryId: '03010000', // INVESTMENT_MOVE
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T12:00:00.000Z',
    };
    await pluggySyncService.syncFinance(itemId, {
      client: makeClientForItem(itemId, [ofTx]),
      now: () => new Date('2026-10-15T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const checking = accounts.find((a) => a.of_account_id === `pg-acc-${itemId}`)!;
    const broker = await finRepository.createAccount({
      name: 'Corretora Lote',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Lote',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset1 = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });
    const asset2 = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const batchRes = await rebalanceExecutionService.executeBatchContributions({
      portfolioId: portfolio.id,
      tradeDate: '2026-10-10',
      cashSource: { accountId: checking.id },
      items: [
        { assetId: asset1.id, ticker: 'PETR4', suggestedQuantity: '10', unitPrice: '40.00' },
        { assetId: asset2.id, ticker: 'VALE3', suggestedQuantity: '10', unitPrice: '60.00' },
      ],
    });
    expect(batchRes.totalExecuted).toBe(2);

    const entriesAfter = await finRepository.listAllEntries();
    const ofEntry = entriesAfter.find((e) => e.external_id === `pluggy:${ofTx.id}`)!;
    expect(ofEntry.kind).toBe('transfer_out');
    expect(ofEntry.linked_transaction_id).toBe(batchRes.transactions[0].id);

    const transferIns = entriesAfter.filter(
      (e) => e.account_id === broker.id && e.kind === 'transfer_in'
    );
    expect(transferIns).toHaveLength(1);
    expect(transferIns[0].amount_cents).toBe(100_000);

    // Excluir a primeira compra restaura o lançamento OF sem apagá-lo
    await transactionService.deleteTransaction(batchRes.transactions[0].id);
    const entriesAfterDel = await finRepository.listAllEntries();
    const ofRestored = entriesAfterDel.find((e) => e.id === ofEntry.id);
    expect(ofRestored).toBeTruthy();
    expect(ofRestored?.linked_transaction_id).toBeNull();
  });

  test('S115-T08 (V4): excluir compra restaura lançamento OF original; sync seguinte preserva lançamento OF ainda ligado', async () => {
    const itemId = 'item-v4';
    await openFinanceRepository.addItem(itemId);
    const ofTx: PluggyTransaction = {
      id: 'tx-v4-of',
      accountId: `pg-acc-${itemId}`,
      description: 'APLICACAO BOLSA',
      currencyCode: 'BRL',
      amount: -500.0,
      date: '2026-10-10T12:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      categoryId: '03010000', // INVESTMENT_MOVE
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T12:00:00.000Z',
    };
    const client = makeClientForItem(itemId, [ofTx]);
    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-12T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const checking = accounts.find((a) => a.of_account_id === `pg-acc-${itemId}`)!;
    const broker = await finRepository.createAccount({
      name: 'Corretora V4',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira V4',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'ITUB4',
      name: 'Itaúsa',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const beforeEntries = await finRepository.listAllEntries();
    const ofBefore = beforeEntries.find((e) => e.external_id === `pluggy:${ofTx.id}`)!;
    const origKind = ofBefore.kind;
    const origGroupId = ofBefore.transfer_group_id;
    const origReason = ofBefore.of_class_reason;

    const buy = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-10-10',
      quantity: '10',
      unitPrice: '50.00',
      cashSource: { accountId: checking.id },
    });

    // Sincronização seguinte NÃO desfaz o vínculo do lançamento ainda ligado
    await pluggySyncService.syncFinance(itemId, {
      client,
      now: () => new Date('2026-10-13T12:00:00Z'),
    });
    const afterResync = await finRepository.getEntryById(ofBefore.id);
    expect(afterResync?.linked_transaction_id).toBe(buy.transaction.id);
    expect(afterResync?.kind).toBe('transfer_out');
    expect(afterResync?.transfer_group_id).toBeTruthy();

    // Excluir compra restaura o lançamento OF exatamente ao estado original e apaga o transfer_in
    await transactionService.deleteTransaction(buy.transaction.id);
    const afterDelete = await finRepository.getEntryById(ofBefore.id);
    expect(afterDelete).toBeTruthy();
    expect(afterDelete?.linked_transaction_id).toBeNull();
    expect(afterDelete?.kind).toBe(origKind);
    expect(afterDelete?.transfer_group_id).toBe(origGroupId);
    expect(afterDelete?.of_class_reason).toBe(origReason);

    const remainingEntries = await finRepository.listAllEntries();
    expect(remainingEntries.some((e) => e.account_id === broker.id)).toBe(false);
  });

  test('S115-T09 (V5): compra de R$ 997,50 casada com OF R$ 1.000,00 gera par 1000/1000, buy 997,50 e saldo corretora +R$ 2,50', async () => {
    const itemId = 'item-v5';
    await openFinanceRepository.addItem(itemId);
    const ofTx: PluggyTransaction = {
      id: 'tx-v5-of',
      accountId: `pg-acc-${itemId}`,
      description: 'TED CORRETORA',
      currencyCode: 'BRL',
      amount: -1000.0,
      date: '2026-10-10T12:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      categoryId: '03010000',
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T12:00:00.000Z',
    };
    await pluggySyncService.syncFinance(itemId, {
      client: makeClientForItem(itemId, [ofTx]),
      now: () => new Date('2026-10-12T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const checking = accounts.find((a) => a.of_account_id === `pg-acc-${itemId}`)!;
    const broker = await finRepository.createAccount({
      name: 'Corretora V5',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira V5',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'WEGE3',
      name: 'WEG',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const buy = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-10-10',
      quantity: '19',
      unitPrice: '52.50', // 19 * 52.50 = 997.50
      cashSource: { accountId: checking.id },
    });

    const entries = await finRepository.listAllEntries();
    const tOut = entries.find((e) => e.external_id === `pluggy:${ofTx.id}`)!;
    const tIn = entries.find(
      (e) => e.account_id === broker.id && e.kind === 'transfer_in'
    )!;
    const invBuy = entries.find(
      (e) => e.account_id === broker.id && e.kind === 'investment_buy' && e.linked_transaction_id === buy.transaction.id
    )!;

    expect(tOut.amount_cents).toBe(100_000);
    expect(tIn.amount_cents).toBe(100_000);
    expect(invBuy.amount_cents).toBe(99_750);

    // Saldo da corretora = +100000 - 99750 = +250 (R$ 2,50)
    const brokerBalance = entries
      .filter((e) => e.account_id === broker.id)
      .reduce((s, e) => s + (e.kind === 'transfer_in' ? e.amount_cents : -e.amount_cents), 0);
    expect(brokerBalance).toBe(250);
  });

  test('S115-T10 (V6): compra dia 1 com transfer_out do app; OF chega dia 6 e substitui sem duplicar débito', async () => {
    const itemId = 'item-v6';
    await openFinanceRepository.addItem(itemId);
    await pluggySyncService.syncFinance(itemId, {
      client: makeClientForItem(itemId, []),
      now: () => new Date('2026-10-01T12:00:00Z'),
    });

    const accounts = await finRepository.listAccounts(true);
    const checking = accounts.find((a) => a.of_account_id === `pg-acc-${itemId}`)!;
    const broker = await finRepository.createAccount({
      name: 'Corretora V6',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira V6',
      targetReturn: '12',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'BBDC4',
      name: 'Bradesco',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    // Dia 1: compra de R$ 997,50 cria transfer_out MANUAL na conta corrente
    const buy = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-10-01',
      quantity: '19',
      unitPrice: '52.50',
      cashSource: { accountId: checking.id },
    });

    // Dia 6: OF traz saída de R$ 1.000,00 (INVESTMENT_MOVE)
    const lateOfTx: PluggyTransaction = {
      id: 'tx-v6-late',
      accountId: `pg-acc-${itemId}`,
      description: 'TED CORRETORA TARDIA',
      currencyCode: 'BRL',
      amount: -1000.0,
      date: '2026-10-06T12:00:00.000Z',
      type: 'DEBIT',
      status: 'POSTED',
      categoryId: '03010000',
      createdAt: '2026-10-06T12:00:00.000Z',
      updatedAt: '2026-10-06T12:00:00.000Z',
    };
    await pluggySyncService.syncFinance(itemId, {
      client: makeClientForItem(itemId, [lateOfTx]),
      now: () => new Date('2026-10-06T15:00:00Z'),
    });

    const entries = await finRepository.listAllEntries();
    const checkingOutflows = entries.filter(
      (e) => e.account_id === checking.id && (e.kind === 'transfer_out' || e.kind === 'expense')
    );
    expect(checkingOutflows).toHaveLength(1);
    expect(checkingOutflows[0].source).toBe('OPEN_FINANCE');
    expect(checkingOutflows[0].linked_transaction_id).toBe(buy.transaction.id);

    const brokerIn = entries.find(
      (e) => e.account_id === broker.id && e.kind === 'transfer_in'
    );
    expect(brokerIn?.amount_cents).toBe(100_000);
    expect(brokerIn?.transfer_group_id).toBe(checkingOutflows[0].transfer_group_id);
  });
});
