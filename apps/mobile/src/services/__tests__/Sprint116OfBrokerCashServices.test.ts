import { getDatabase, initializeDatabase, resetDatabase } from '../../db/client';
import {
  assets,
  finAccounts,
  finEntries,
  incomeEvents,
  portfolios,
  transactions,
} from '../../db/schema';
import type { FinAccount, FinEntry } from '../../db/schema';
import { calculateAccountBalance, monthSummary } from '../../domain/financeFlow';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { finService, OF_LINKED_CASH_CLEANUP_V1_META_KEY } from '../finService';
import { getInvestmentAccountIds } from '../investmentAccountsService';
import { monthCloseService } from '../monthCloseService';
import { pluggySyncService } from '../pluggy/pluggySyncService';
import {
  bankPixOutTxs,
  brokerExportTxs,
  brokerPixInTxs,
  makeSprint116Client,
  s116Tx,
  SPRINT116_NOW,
  SPRINT116_TODAY_ISO,
} from '../pluggy/__tests__/sprint116ExportFixture';
import type { PluggyTransaction } from '../pluggy/types';
import { rebalanceExecutionService } from '../rebalanceExecution';
import { transactionService } from '../transactionService';

type Batchable = FinEntry & { batch_id?: string | null };

const ITEM = 'item-s116';
const PG_BANK = 'pg-s116-bank';
const PG_BROKER = 'pg-s116-broker';

async function syncItem(txs: PluggyTransaction[], itemId = ITEM): Promise<void> {
  await openFinanceRepository.addItem(itemId).catch(() => undefined);
  await pluggySyncService.syncFinance(itemId, {
    client: makeSprint116Client(
      itemId,
      [
        { pgId: PG_BANK, name: 'Conta Corrente', balance: 0 },
        { pgId: PG_BROKER, name: 'Conta Corretora', balance: 14.25 },
      ],
      txs
    ),
    now: () => SPRINT116_NOW,
  });
}

async function ofAccounts(): Promise<{ bank: FinAccount; broker: FinAccount }> {
  const accounts = await finRepository.listAccounts(true);
  return {
    bank: accounts.find((a) => a.of_account_id === PG_BANK)!,
    broker: accounts.find((a) => a.of_account_id === PG_BROKER)!,
  };
}

async function newPortfolioLinkedTo(accountId: string, name = 'Carteira S116') {
  const portfolio = await portfolioRepository.createPortfolio({ name, targetReturn: '12', ofItemId: ITEM });
  await portfolioRepository.linkFinAccount(portfolio.id, accountId);
  return portfolio;
}

async function newAsset(portfolioId: string, ticker: string) {
  return assetRepository.createAsset({
    portfolio_id: portfolioId,
    ticker,
    name: ticker,
    asset_class: 'STOCK',
    quantity: '0',
    average_price: '0.00',
  });
}

async function balanceOf(account: FinAccount): Promise<number> {
  const entries = await finRepository.listAllEntries();
  return calculateAccountBalance(account.initial_balance_cents, entries, account.id);
}

async function appCreatedCashEntries(): Promise<FinEntry[]> {
  const all = await finRepository.listAllEntries();
  return all.filter(
    (e) =>
      e.source !== 'OPEN_FINANCE' &&
      ['investment_buy', 'investment_sell', 'investment_income', 'transfer_in', 'transfer_out'].includes(e.kind)
  );
}

describe('Sprint 116 — serviços: dinheiro real da corretora via Open Finance (W1, W2, W3, W4, W5)', () => {
  beforeEach(async () => {
    resetDatabase();
    await initializeDatabase();
    const db = getDatabase();
    await db.delete(finEntries);
    await db.delete(incomeEvents);
    await db.delete(transactions);
    await db.delete(assets);
    await db.delete(portfolios);
    await db.delete(finAccounts);
  });

  describe('W1 — conta vinculada Open Finance: o extrato manda', () => {
    test('S116-T13 (W1a): compra e venda manuais em carteira vinculada à conta OF não lançam nada nem mudam o saldo', async () => {
      await syncItem(brokerExportTxs(PG_BROKER));
      const { bank, broker } = await ofAccounts();
      const portfolio = await newPortfolioLinkedTo(broker.id);
      const asset = await newAsset(portfolio.id, 'HGLG11');
      const entriesBefore = (await finRepository.listAllEntries()).length;
      const balanceBefore = await balanceOf(broker);
      const bankBefore = await balanceOf(bank);

      const buy = await transactionService.executeTransaction({
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: '2026-11-17',
        quantity: '10',
        unitPrice: '30.00',
      });
      // com origem explícita em outra conta também não cria transferência
      await transactionService.executeTransaction({
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: '2026-11-17',
        quantity: '2',
        unitPrice: '30.00',
        cashSource: { accountId: bank.id },
      });
      await transactionService.executeTransaction({
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'SELL',
        tradeDate: '2026-11-17',
        quantity: '1',
        unitPrice: '31.00',
      });

      expect(buy.updatedAsset.quantity).toBe('10');
      expect(await appCreatedCashEntries()).toHaveLength(0);
      expect((await finRepository.listAllEntries()).length).toBe(entriesBefore);
      expect(await balanceOf(broker)).toBe(balanceBefore);
      expect(await balanceOf(bank)).toBe(bankBefore);
    });

    test('S116-T14 (W1b): a liquidação "LIQ BOLSA - VISTA BRUTO" (−623,09) casa pela soma das compras do pregão; só grava linked_transaction_id', async () => {
      await syncItem(brokerExportTxs(PG_BROKER));
      const { broker } = await ofAccounts();
      const portfolio = await newPortfolioLinkedTo(broker.id);
      const a = await newAsset(portfolio.id, 'HGLG11');
      const b = await newAsset(portfolio.id, 'XPLG11');

      const before = (await finRepository.listAllEntries()).find((e) => e.external_id === 's116-brk-n11')!;
      expect(before.kind).toBe('transfer_out');
      expect(before.amount_cents).toBe(62_309);
      expect(before.linked_transaction_id).toBeNull();

      // 1ª compra do pregão de 06/11: 5 × 62,30 = 311,50 (não fecha a nota ainda)
      await transactionService.executeTransaction({
        portfolioId: portfolio.id, assetId: a.id, type: 'BUY', tradeDate: '2026-11-06', quantity: '5', unitPrice: '62.30',
      });
      const afterFirst = (await finRepository.listAllEntries()).find((e) => e.id === before.id)!;
      expect(afterFirst.linked_transaction_id).toBeNull();

      // 2ª compra: 1 × 311,59 + taxas 0,17 = 311,76 → soma 623,26 (taxas B3 do pregão = 0,17)
      const second = await transactionService.executeTransaction({
        portfolioId: portfolio.id, assetId: b.id, type: 'BUY', tradeDate: '2026-11-06', quantity: '1', unitPrice: '311.59', fees: '0.17',
      });
      const linked = (await finRepository.listAllEntries()).find((e) => e.id === before.id)!;
      expect(linked.linked_transaction_id).toBe(second.transaction.id);
      expect(linked.kind).toBe(before.kind);
      expect(linked.amount_cents).toBe(before.amount_cents);
      expect(linked.paid_amount_cents).toBe(before.paid_amount_cents);
      expect(linked.of_link_restore).toBeTruthy();
      expect(JSON.parse(linked.of_link_restore as string).kind).toBe('transfer_out');
      // nada criado pelo app
      expect(await appCreatedCashEntries()).toHaveLength(0);

      // excluir a compra que casou restaura o lançamento OF (V4) sem apagá-lo
      await transactionService.deleteTransaction(second.transaction.id);
      const restored = (await finRepository.listAllEntries()).find((e) => e.id === before.id)!;
      expect(restored).toBeTruthy();
      expect(restored.linked_transaction_id).toBeNull();
      expect(restored.kind).toBe('transfer_out');
    });

    test('S116-T15 (W1b): sem liquidação correspondente nada é gravado', async () => {
      await syncItem(brokerExportTxs(PG_BROKER));
      const { broker } = await ofAccounts();
      const portfolio = await newPortfolioLinkedTo(broker.id);
      const a = await newAsset(portfolio.id, 'HGLG11');
      const entriesBefore = await finRepository.listAllEntries();

      await transactionService.executeTransaction({
        portfolioId: portfolio.id, assetId: a.id, type: 'BUY', tradeDate: '2026-11-06', quantity: '3', unitPrice: '100.00',
      });
      const entriesAfter = await finRepository.listAllEntries();
      expect(entriesAfter).toHaveLength(entriesBefore.length);
      expect(entriesAfter.filter((e) => e.linked_transaction_id)).toHaveLength(0);
    });

    test('S116-T16 (W1a): carteira com conta broker manual continua lançando compra e aporte como hoje', async () => {
      await syncItem([]);
      const { bank } = await ofAccounts();
      const manualBroker = await finRepository.createAccount({ name: 'Corretora Manual', type: 'broker', initialBalanceCents: 0 });
      const portfolio = await newPortfolioLinkedTo(manualBroker.id, 'Carteira Manual');
      const a = await newAsset(portfolio.id, 'PETR4');

      await transactionService.executeTransaction({
        portfolioId: portfolio.id, assetId: a.id, type: 'BUY', tradeDate: '2026-11-10', quantity: '10', unitPrice: '30.00',
        cashSource: { accountId: bank.id },
      });
      const created = await appCreatedCashEntries();
      expect(created.filter((e) => e.kind === 'investment_buy' && e.account_id === manualBroker.id)).toHaveLength(1);
      expect(created.filter((e) => e.kind === 'transfer_out' && e.account_id === bank.id)).toHaveLength(1);
      expect(created.filter((e) => e.kind === 'transfer_in' && e.account_id === manualBroker.id)).toHaveLength(1);
    });

    test('S116-T17 (W1a): aporte em lote em carteira vinculada à conta OF não cria transferência nem investment_buy', async () => {
      await syncItem(brokerExportTxs(PG_BROKER));
      const { bank, broker } = await ofAccounts();
      const portfolio = await newPortfolioLinkedTo(broker.id);
      const a = await newAsset(portfolio.id, 'HGLG11');
      const b = await newAsset(portfolio.id, 'XPLG11');
      const entriesBefore = (await finRepository.listAllEntries()).length;

      const res = await rebalanceExecutionService.executeBatchContributions({
        portfolioId: portfolio.id,
        tradeDate: '2026-11-06',
        cashSource: { accountId: bank.id },
        items: [
          { assetId: a.id, ticker: 'HGLG11', suggestedQuantity: '5', unitPrice: '62.30' },
          { assetId: b.id, ticker: 'XPLG11', suggestedQuantity: '1', unitPrice: '311.59', fees: '0.17' },
        ],
      });
      expect(res.totalExecuted).toBe(2);
      expect(await appCreatedCashEntries()).toHaveLength(0);
      expect((await finRepository.listAllEntries()).length).toBe(entriesBefore);
      // a nota do pregão fecha com a soma do lote
      const liq = (await finRepository.listAllEntries()).find((e) => e.external_id === 's116-brk-n11')!;
      expect(liq.linked_transaction_id).toBeTruthy();
      expect(liq.kind).toBe('transfer_out');
    });

    test('S116-T18 (W1a/R41): provento em carteira vinculada à conta OF não cria investment_income; em conta manual cria', async () => {
      await syncItem([]);
      const { broker } = await ofAccounts();
      const ofPortfolio = await newPortfolioLinkedTo(broker.id);
      await incomeRepository.addIncome({
        portfolioId: ofPortfolio.id, ticker: 'MXRF11', payDate: '2026-11-16', amount: '60.51', kind: 'RENDIMENTO',
      });
      expect((await finRepository.listAllEntries()).filter((e) => e.kind === 'investment_income')).toHaveLength(0);

      const manualBroker = await finRepository.createAccount({ name: 'Corretora Manual', type: 'broker', initialBalanceCents: 0 });
      const manualPortfolio = await newPortfolioLinkedTo(manualBroker.id, 'Carteira Manual');
      await incomeRepository.addIncome({
        portfolioId: manualPortfolio.id, ticker: 'MXRF11', payDate: '2026-11-16', amount: '60.51', kind: 'RENDIMENTO',
      });
      const incomes = (await finRepository.listAllEntries()).filter((e) => e.kind === 'investment_income');
      expect(incomes).toHaveLength(1);
      expect(incomes[0].account_id).toBe(manualBroker.id);
    });

    test('S116-T19 (W1d): migration:of-linked-cash-cleanup:v1 limpa só carteiras ligadas a conta OF, restaura OF casado e é idempotente', async () => {
      await syncItem(brokerExportTxs(PG_BROKER));
      const { bank, broker } = await ofAccounts();
      const manualBroker = await finRepository.createAccount({ name: 'Corretora Manual', type: 'broker', initialBalanceCents: 0 });

      // Carteira A: conta broker manual (nada muda). Carteira B: começa em conta manual (legado) e passa para a conta OF.
      const pManual = await newPortfolioLinkedTo(manualBroker.id, 'Carteira A');
      const pLegacy = await newPortfolioLinkedTo(manualBroker.id, 'Carteira B');
      const aManual = await newAsset(pManual.id, 'PETR4');
      const aLegacy = await newAsset(pLegacy.id, 'VALE3');
      await transactionService.executeTransaction({
        portfolioId: pManual.id, assetId: aManual.id, type: 'BUY', tradeDate: '2026-11-10', quantity: '10', unitPrice: '30.00',
        cashSource: { accountId: bank.id },
      });
      const legacyBuy = await transactionService.executeTransaction({
        portfolioId: pLegacy.id, assetId: aLegacy.id, type: 'BUY', tradeDate: '2026-11-11', quantity: '4', unitPrice: '50.00',
        cashSource: { accountId: bank.id },
      });
      const legacyIncome = await incomeRepository.addIncome({
        portfolioId: pLegacy.id, ticker: 'VALE3', payDate: '2026-11-12', amount: '12.00', kind: 'DIVIDENDO',
      });
      // casamento antigo (Sprint 114) com a liquidação OF da carteira B
      const liq = (await finRepository.listAllEntries()).find((e) => e.external_id === 's116-brk-n11')!;
      await finRepository.updateEntry(liq.id, {
        linked_transaction_id: legacyBuy.transaction.id,
        of_link_restore: JSON.stringify({ kind: 'transfer_out', transfer_group_id: null, of_class_reason: 'INVESTMENT_MOVE' }),
      });
      await portfolioRepository.linkFinAccount(pLegacy.id, broker.id);

      const manualBefore = (await appCreatedCashEntries()).filter((e) => e.account_id === manualBroker.id || e.account_id === bank.id);
      expect(manualBefore.length).toBeGreaterThanOrEqual(5);

      const removed = await finService.migrateOfLinkedCashCleanupIfNeeded();
      expect(removed).toBeGreaterThan(0);
      expect(await appMetaRepository.get(OF_LINKED_CASH_CLEANUP_V1_META_KEY)).toBeTruthy();

      const after = await finRepository.listAllEntries();
      // nada ligado à compra/provento da carteira B sobrou criado pelo app
      expect(after.filter((e) => e.source !== 'OPEN_FINANCE' && e.linked_transaction_id === legacyBuy.transaction.id)).toHaveLength(0);
      expect(after.filter((e) => e.linked_income_id === legacyIncome.id && e.kind === 'investment_income')).toHaveLength(0);
      // carteira A intocada: investment_buy, transferência e par continuam
      const manualAfter = after.filter((e) => e.source !== 'OPEN_FINANCE' && e.linked_transaction_id);
      expect(manualAfter.filter((e) => e.kind === 'investment_buy' && e.account_id === manualBroker.id)).toHaveLength(1);
      expect(manualAfter.filter((e) => e.kind === 'transfer_in' && e.account_id === manualBroker.id)).toHaveLength(1);
      expect(manualAfter.filter((e) => e.kind === 'transfer_out' && e.account_id === bank.id)).toHaveLength(1);
      // lançamento OF casado foi restaurado, não apagado
      const liqAfter = after.find((e) => e.id === liq.id)!;
      expect(liqAfter).toBeTruthy();
      expect(liqAfter.linked_transaction_id).toBeNull();
      expect(liqAfter.kind).toBe('transfer_out');
      expect(liqAfter.amount_cents).toBe(62_309);

      // idempotente
      const again = await finService.migrateOfLinkedCashCleanupIfNeeded();
      expect(again).toBe(0);
      expect((await finRepository.listAllEntries()).length).toBe(after.length);
    });
  });

  describe('W2 — aportes sem fantasmas (export real de novembro/outubro)', () => {
    async function summaryFor(ym: string) {
      const entries = await finRepository.listAllEntries();
      return monthSummary(entries, ym, {
        todayIso: SPRINT116_TODAY_ISO,
        accounts: await finRepository.listAccounts(false),
        linkedAccountIds: await getInvestmentAccountIds(),
      });
    }

    test('S116-T20 (W2): novembro e outubro só com o movimento interno da corretora ⇒ aporte 0, nada em despesas', async () => {
      await syncItem(brokerExportTxs(PG_BROKER));
      const { broker } = await ofAccounts();
      await newPortfolioLinkedTo(broker.id);

      const nov = await summaryFor('2026-11');
      expect(nov.contributionCents).toBe(0);
      expect(nov.expenseCents).toBe(0);
      // só rendimentos (FII 2,52 + 2,46 + 2,34 + 4,65 e remunerações de 0,01); nada de aplicação/resgate/liquidação
      expect(nov.incomeCents).toBe(252 + 246 + 234 + 465 + 1 + 1);
      expect(nov.netCents).toBe(nov.incomeCents);

      const oct = await summaryFor('2026-10');
      expect(oct.contributionCents).toBe(0);
      expect(oct.expenseCents).toBe(0);
    });

    test('S116-T21 (W2): o Pix de R$ 227,17 (nov) e de R$ 398,85 (out) de outra conta para a corretora é o único aporte real', async () => {
      await syncItem([...brokerExportTxs(PG_BROKER), ...brokerPixInTxs(PG_BROKER), ...bankPixOutTxs(PG_BANK)]);
      const { broker } = await ofAccounts();
      await newPortfolioLinkedTo(broker.id);

      const nov = await summaryFor('2026-11');
      expect(nov.contributionCents).toBe(22_717);
      expect(nov.expenseCents).toBe(0);
      const oct = await summaryFor('2026-10');
      expect(oct.contributionCents).toBe(39_885);

      const proposal = await monthCloseService.getProposal('2026-11', { todayIso: SPRINT116_TODAY_ISO });
      expect(proposal.summary.contributionCents).toBe(22_717);
    });

    test('S116-T22 (W2): TED de R$ 1.000 entre duas contas OF (par of-tr-) soma 1.000 e o resgate de volta subtrai', async () => {
      const txs = [
        s116Tx(PG_BANK, 's116-ted-out', '2026-11-04', -1000, 'TED enviada para <contraparte>', '04000000', 'Same person transfer'),
        s116Tx(PG_BROKER, 's116-ted-in', '2026-11-04', 1000, 'TED recebida de <contraparte>', '04000000', 'Same person transfer'),
      ];
      await syncItem(txs);
      const { broker } = await ofAccounts();
      await newPortfolioLinkedTo(broker.id);
      const entries = await finRepository.listAllEntries();
      const pair = entries.filter((e) => e.transfer_group_id?.startsWith('of-tr-'));
      expect(pair).toHaveLength(2);
      expect((await summaryFor('2026-11')).contributionCents).toBe(100_000);

      const back = [
        ...txs,
        s116Tx(PG_BROKER, 's116-back-out', '2026-11-12', -400, 'TED enviada para <contraparte>', '04000000', 'Same person transfer'),
        s116Tx(PG_BANK, 's116-back-in', '2026-11-12', 400, 'TED recebida de <contraparte>', '04000000', 'Same person transfer'),
      ];
      await syncItem(back);
      expect((await summaryFor('2026-11')).contributionCents).toBe(60_000);
    });

    test('S116-T23 (W2): aplicação automática em conta que não é de investimento vale 0; TED sem par para corretora externa soma', async () => {
      const txs = [
        s116Tx(PG_BANK, 's116-sweep', '2026-11-05', -398.36, 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA', '03000000'),
        s116Tx(PG_BANK, 's116-resg', '2026-11-06', 100, 'CONTA REMUNERADA - RESGATE APLICAÇÃO', '03000000'),
      ];
      await syncItem(txs);
      const { broker } = await ofAccounts();
      await newPortfolioLinkedTo(broker.id);
      expect((await summaryFor('2026-11')).contributionCents).toBe(0);

      await syncItem([...txs, s116Tx(PG_BANK, 's116-ted-corr', '2026-11-08', -800, 'TED CORRETORA', '03010000')]);
      expect((await summaryFor('2026-11')).contributionCents).toBe(80_000);
    });
  });

  describe('W3 — aporte em lote ligado ao lote (batch_id)', () => {
    async function setupBatch() {
      const checking = await finRepository.createAccount({ name: 'Conta Corrente', type: 'checking', initialBalanceCents: 500_000 });
      const manualBroker = await finRepository.createAccount({ name: 'Corretora Lote', type: 'broker', initialBalanceCents: 0 });
      const portfolio = await newPortfolioLinkedTo(manualBroker.id, 'Carteira Lote');
      const a = await newAsset(portfolio.id, 'PETR4');
      const b = await newAsset(portfolio.id, 'VALE3');
      const c = await newAsset(portfolio.id, 'ITUB4');
      const res = await rebalanceExecutionService.executeBatchContributions({
        portfolioId: portfolio.id,
        tradeDate: '2026-11-10',
        cashSource: { accountId: checking.id },
        items: [
          { assetId: a.id, ticker: 'PETR4', suggestedQuantity: '10', unitPrice: '40.00' }, // 400,00
          { assetId: b.id, ticker: 'VALE3', suggestedQuantity: '10', unitPrice: '60.00' }, // 600,00
          { assetId: c.id, ticker: 'ITUB4', suggestedQuantity: '5', unitPrice: '20.00' }, // 100,00
        ],
      });
      return { checking, manualBroker, res };
    }

    const transfersOf = async (): Promise<Batchable[]> =>
      ((await finRepository.listAllEntries()) as Batchable[]).filter(
        (e) => e.kind === 'transfer_out' || e.kind === 'transfer_in'
      );

    test('S116-T24 (W3): lote de 3 compras — excluir a 1ª reduz a transferência pela soma das outras 2; excluir todas apaga a transferência', async () => {
      const { res } = await setupBatch();
      const all = (await finRepository.listAllEntries()) as Batchable[];
      const buys = all.filter((e) => e.kind === 'investment_buy');
      const transfers = await transfersOf();
      expect(buys).toHaveLength(3);
      expect(transfers).toHaveLength(2);
      expect(transfers.every((t) => t.amount_cents === 110_000)).toBe(true);
      // batch_id igual na transferência (out e in) e em todas as compras
      const batchId = transfers[0].batch_id;
      expect(batchId).toBeTruthy();
      expect(new Set([...transfers, ...buys].map((e) => e.batch_id)).size).toBe(1);

      await transactionService.deleteTransaction(res.transactions[0].id); // 400,00
      let rest = await transfersOf();
      expect(rest).toHaveLength(2);
      expect(rest.every((t) => t.amount_cents === 70_000)).toBe(true);
      expect(rest.every((t) => (t.paid_amount_cents ?? t.amount_cents) === 70_000)).toBe(true);
      expect((await finRepository.listAllEntries()).filter((e) => e.kind === 'investment_buy')).toHaveLength(2);

      await transactionService.deleteTransaction(res.transactions[2].id); // 100,00
      rest = await transfersOf();
      expect(rest.every((t) => t.amount_cents === 60_000)).toBe(true);

      await transactionService.deleteTransaction(res.transactions[1].id); // última
      expect(await transfersOf()).toHaveLength(0);
      expect((await finRepository.listAllEntries()).filter((e) => e.kind === 'investment_buy')).toHaveLength(0);
    });

    test('S116-T25 (W3): excluir uma compra que NÃO é a primeira também reduz a transferência', async () => {
      const { res } = await setupBatch();
      await transactionService.deleteTransaction(res.transactions[1].id); // 600,00
      const rest = await transfersOf();
      expect(rest).toHaveLength(2);
      expect(rest.every((t) => t.amount_cents === 50_000)).toBe(true);
    });

    test('S116-T26 (W3): transfer_out OF casado — excluir uma compra ajusta só o transfer_in; a última restaura o lançamento OF', async () => {
      const ofOut = s116Tx(PG_BANK, 's116-lote-of', '2026-11-10', -1100, 'TED CORRETORA', '03010000');
      await syncItem([ofOut]);
      const { bank } = await ofAccounts();
      const manualBroker = await finRepository.createAccount({ name: 'Corretora Lote', type: 'broker', initialBalanceCents: 0 });
      const portfolio = await newPortfolioLinkedTo(manualBroker.id, 'Carteira Lote');
      const a = await newAsset(portfolio.id, 'PETR4');
      const b = await newAsset(portfolio.id, 'VALE3');
      const c = await newAsset(portfolio.id, 'ITUB4');
      const res = await rebalanceExecutionService.executeBatchContributions({
        portfolioId: portfolio.id,
        tradeDate: '2026-11-10',
        cashSource: { accountId: bank.id },
        items: [
          { assetId: a.id, ticker: 'PETR4', suggestedQuantity: '10', unitPrice: '40.00' },
          { assetId: b.id, ticker: 'VALE3', suggestedQuantity: '10', unitPrice: '60.00' },
          { assetId: c.id, ticker: 'ITUB4', suggestedQuantity: '5', unitPrice: '20.00' },
        ],
      });
      const of = (await finRepository.listAllEntries()).find((e) => e.external_id === 's116-lote-of')!;
      expect(of.linked_transaction_id).toBeTruthy();
      expect(of.amount_cents).toBe(110_000);

      await transactionService.deleteTransaction(res.transactions[0].id);
      let all = (await finRepository.listAllEntries()) as Batchable[];
      const ofAfter = all.find((e) => e.id === of.id)!;
      expect(ofAfter.linked_transaction_id).toBeTruthy();
      expect(ofAfter.kind).toBe('transfer_out');
      expect(ofAfter.amount_cents).toBe(110_000);
      const transferIn = all.find((e) => e.kind === 'transfer_in' && e.account_id === manualBroker.id)!;
      expect(transferIn.amount_cents).toBe(70_000);

      await transactionService.deleteTransaction(res.transactions[1].id);
      await transactionService.deleteTransaction(res.transactions[2].id);
      all = (await finRepository.listAllEntries()) as Batchable[];
      const ofRestored = all.find((e) => e.id === of.id)!;
      expect(ofRestored).toBeTruthy();
      expect(ofRestored.linked_transaction_id).toBeNull();
      expect(ofRestored.kind).toBe('transfer_out');
      expect(all.filter((e) => e.kind === 'transfer_in' && e.account_id === manualBroker.id)).toHaveLength(0);
    });
  });

  describe('W4 — restauração de casamentos antigos (sem of_link_restore)', () => {
    async function legacyMatched(tx: PluggyTransaction, patch: Partial<FinEntry>) {
      await syncItem([tx]);
      const portfolio = await newPortfolioLinkedTo(
        (await finRepository.createAccount({ name: 'Corretora', type: 'broker', initialBalanceCents: 0 })).id
      );
      const asset = await newAsset(portfolio.id, 'PETR4');
      const buy = await transactionService.executeTransaction({
        portfolioId: portfolio.id, assetId: asset.id, type: 'BUY', tradeDate: '2026-11-10', quantity: '1', unitPrice: '10.00',
        cashSource: null,
      });
      const entry = (await finRepository.listAllEntries()).find((e) => e.external_id === tx.id)!;
      await finRepository.updateEntry(entry.id, {
        linked_transaction_id: buy.transaction.id,
        of_link_restore: null,
        ...patch,
      } as never);
      await transactionService.deleteTransaction(buy.transaction.id);
      return (await finRepository.listAllEntries()).find((e) => e.id === entry.id)!;
    }

    test('S116-T27 (W4): INVESTMENT_MOVE ou com transfer_group_id restaura como transfer_out sem grupo', async () => {
      const ofTx = s116Tx(PG_BANK, 's116-w4-a', '2026-11-10', -500, 'TED CORRETORA', '03010000');
      const restored = await legacyMatched(ofTx, { kind: 'transfer_out', transfer_group_id: 'tr-legado', of_class_reason: 'INVESTMENT_MOVE' });
      expect(restored.kind).toBe('transfer_out');
      expect(restored.transfer_group_id).toBeNull();
      expect(restored.linked_transaction_id).toBeNull();
    });

    test('S116-T28 (W4): sem esses sinais usa a classificação dos campos crus (crédito vira income, não expense)', async () => {
      const ofTx = s116Tx(PG_BANK, 's116-w4-b', '2026-11-10', 3000, 'Salário recebido', '01010000', 'Salary');
      const restored = await legacyMatched(ofTx, { kind: 'income', transfer_group_id: null, of_class_reason: 'SIGN' });
      expect(restored.kind).toBe('income');
      expect(restored.transfer_group_id).toBeNull();
    });
  });

  describe('W5 — casamento inverso só com movimento de investimento', () => {
    test('S116-T29 (W5): aplicação automática de mesmo valor não substitui o transfer_out do app; TED para a corretora substitui', async () => {
      await syncItem([]);
      const { bank } = await ofAccounts();
      const manualBroker = await finRepository.createAccount({ name: 'Corretora Manual', type: 'broker', initialBalanceCents: 0 });
      const portfolio = await newPortfolioLinkedTo(manualBroker.id, 'Carteira Manual');
      const asset = await newAsset(portfolio.id, 'PETR4');
      await transactionService.executeTransaction({
        portfolioId: portfolio.id, assetId: asset.id, type: 'BUY', tradeDate: '2026-11-10', quantity: '10', unitPrice: '30.00',
        cashSource: { accountId: bank.id },
      });
      const appOut = (await finRepository.listAllEntries()).find((e) => e.kind === 'transfer_out' && e.source !== 'OPEN_FINANCE')!;
      expect(appOut.amount_cents).toBe(30_000);

      // aplicação automática de R$ 300,00 no mesmo dia: não é a transferência do app
      await syncItem([s116Tx(PG_BANK, 's116-w5-sweep', '2026-11-10', -300, 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA', '03000000')]);
      let all = await finRepository.listAllEntries();
      expect(all.find((e) => e.id === appOut.id)).toBeTruthy();
      expect(all.find((e) => e.external_id === 's116-w5-sweep')!.linked_transaction_id).toBeNull();

      // TED para a corretora de mesmo valor: substitui a transferência do app (V6)
      await syncItem([
        s116Tx(PG_BANK, 's116-w5-sweep', '2026-11-10', -300, 'CONTA REMUNERADA - APLICAÇÃO AUTOMÁTICA', '03000000'),
        s116Tx(PG_BANK, 's116-w5-ted', '2026-11-11', -300, 'TED CORRETORA', '03010000'),
      ]);
      all = await finRepository.listAllEntries();
      expect(all.find((e) => e.id === appOut.id)).toBeUndefined();
      const ted = all.find((e) => e.external_id === 's116-w5-ted')!;
      expect(ted.linked_transaction_id).toBeTruthy();
      expect(ted.kind).toBe('transfer_out');
    });
  });
});
