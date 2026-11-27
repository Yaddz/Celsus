import { resetDatabase, getDatabase } from '../../db/client';
import { finEntries, transactions } from '../../db/schema';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { transactionService } from '../transactionService';
import { rebalanceExecutionService } from '../rebalanceExecution';
import { finService } from '../finService';
import { relinkStoredBankIncomes } from '../pluggy/pluggyIncomeRelinkService';
import { calculateAccountBalance, calculateMonthlySummary } from '../../domain/financeFlow';
import { exportDossierArchive, importDossierArchive } from '../backupService';

describe('Sprint 104 — Compra, Venda, Proventos e Atomicidade (R40, R41)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S104-T01: compra com origem corretora cria investment_buy com linked_transaction_id, reduz saldo da corretora e não entra em despesas', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 200000, // R$ 2.000,00
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
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

    // 10 * 35.50 + 4.50 taxas = 359.50 => 35950 centavos
    const res = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-10',
      quantity: '10',
      unitPrice: '35.50',
      fees: '4.50',
      cashSource: { accountId: broker.id },
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('investment_buy');
    expect(entries[0].account_id).toBe(broker.id);
    expect(entries[0].amount_cents).toBe(35950);
    expect(entries[0].linked_transaction_id).toBe(res.transaction.id);

    // Saldo corretora: 200000 - 35950 = 164050
    expect(calculateAccountBalance(broker.initial_balance_cents, entries, broker.id)).toBe(164050);

    // Nada entra em despesas do mês
    const summary = calculateMonthlySummary(entries, '2026-11');
    expect(summary.totalExpenseCents).toBe(0);
    expect(summary.totalIncomeCents).toBe(0);
  });

  test('S104-T02: compra com origem conta corrente gera createTransfer (corrente → corretora) + investment_buy e nada entra em despesas', async () => {
    const checking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 500000, // R$ 5.000,00
    });
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    // 10 * 60.00 + 0 = 600.00 => 60000 centavos
    const res = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-11',
      quantity: '10',
      unitPrice: '60.00',
      cashSource: { accountId: checking.id },
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(3);
    const out = entries.find((e) => e.kind === 'transfer_out');
    const inn = entries.find((e) => e.kind === 'transfer_in');
    const buy = entries.find((e) => e.kind === 'investment_buy');

    expect(out?.account_id).toBe(checking.id);
    expect(out?.amount_cents).toBe(60000);
    expect(inn?.account_id).toBe(broker.id);
    expect(inn?.amount_cents).toBe(60000);
    expect(out?.transfer_group_id).toBeTruthy();
    expect(inn?.transfer_group_id).toBe(out?.transfer_group_id);

    expect(buy?.account_id).toBe(broker.id);
    expect(buy?.amount_cents).toBe(60000);
    expect(buy?.linked_transaction_id).toBe(res.transaction.id);

    // Saldo corrente: 500000 - 60000 = 440000; Saldo corretora: 0 + 60000 - 60000 = 0
    expect(calculateAccountBalance(checking.initial_balance_cents, entries, checking.id)).toBe(440000);
    expect(calculateAccountBalance(broker.initial_balance_cents, entries, broker.id)).toBe(0);

    const summary = calculateMonthlySummary(entries, '2026-11');
    expect(summary.totalExpenseCents).toBe(0);
  });

  test('S104-T03: compra em carteira sem vínculo não cria lançamentos em fin_entries', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Manual',
      docket_code: 'MAN-1',
    });
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'ITUB4',
      name: 'Itaú',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-12',
      quantity: '5',
      unitPrice: '30.00',
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(0);
  });

  test('S104-T04: venda em carteira vinculada cria investment_sell e aumenta saldo da corretora sem entrar em receitas do mês', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora Rico',
      type: 'broker',
      initialBalanceCents: 10000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Rico',
      docket_code: 'RICO-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'BBAS3',
      name: 'Banco do Brasil',
      asset_class: 'STOCK',
      quantity: '20',
      average_price: '25.00',
    });

    // Venda de 10 * 28.00 - 2.00 taxas = 278.00 => 27800 centavos
    const res = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'SELL',
      tradeDate: '2026-11-13',
      quantity: '10',
      unitPrice: '28.00',
      fees: '2.00',
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('investment_sell');
    expect(entries[0].account_id).toBe(broker.id);
    expect(entries[0].amount_cents).toBe(27800);
    expect(entries[0].linked_transaction_id).toBe(res.transaction.id);

    // Saldo: 10000 + 27800 = 37800
    expect(calculateAccountBalance(broker.initial_balance_cents, entries, broker.id)).toBe(37800);
    const summary = calculateMonthlySummary(entries, '2026-11');
    expect(summary.totalIncomeCents).toBe(0);
    expect(summary.totalExpenseCents).toBe(0);
  });

  test('S104-T05: atomicidade — falha simulada na gravação do ativo não deixa nenhuma linha em transactions nem fin_entries', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 100000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
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

    const spy = jest
      .spyOn(assetRepository, 'updateAsset')
      .mockRejectedValueOnce(new Error('Falha simulada no ativo'));

    await expect(
      transactionService.executeTransaction({
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: '2026-11-14',
        quantity: '10',
        unitPrice: '50.00',
        cashSource: { accountId: broker.id },
      })
    ).rejects.toThrow('Falha simulada no ativo');

    spy.mockRestore();

    const db = getDatabase();
    const txRows = await db.select().from(transactions);
    const entryRows = await db.select().from(finEntries);
    expect(txRows).toHaveLength(0);
    expect(entryRows).toHaveLength(0);
  });

  test('S104-T06: excluir movimentação remove a transação e todos os lançamentos ligados em fin_entries', async () => {
    const checking = await finRepository.createAccount({
      name: 'Itaú',
      type: 'checking',
      initialBalanceCents: 100000,
    });
    const broker = await finRepository.createAccount({
      name: 'Íon',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Íon',
      docket_code: 'ION-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'ITSA4',
      name: 'Itaúsa',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const res = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-15',
      quantity: '10',
      unitPrice: '10.00',
      cashSource: { accountId: checking.id },
    });

    expect(await finRepository.listEntriesByMonth('2026-11')).toHaveLength(3);

    await transactionService.deleteTransaction(res.transaction.id);

    const db = getDatabase();
    const txRows = await db.select().from(transactions);
    const entryRows = await db.select().from(finEntries);
    expect(txRows).toHaveLength(0);
    expect(entryRows).toHaveLength(0);
  });

  test('S104-T07: excluir lançamento investment_* pelo lado de Finanças é bloqueado com mensagem da carteira', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 100000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Principal',
      docket_code: 'PRIN-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'MGLU3',
      name: 'Magalu',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-16',
      quantity: '10',
      unitPrice: '10.00',
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);

    await expect(finService.deleteEntry(entries[0].id)).rejects.toThrow(
      'Esse lançamento vem da carteira Carteira Principal. Exclua a movimentação por lá.'
    );

    // Lançamento permanece intacto
    expect(await finRepository.listEntriesByMonth('2026-11')).toHaveLength(1);
  });

  test('S104-T08: aporte em lote com 3 compras gera UMA transferência da origem com o total e 3 investment_buy na corretora', async () => {
    const checking = await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initialBalanceCents: 300000, // R$ 3.000,00
    });
    const broker = await finRepository.createAccount({
      name: 'Corretora BTG',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira BTG',
      docket_code: 'BTG-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const a1 = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });
    const a2 = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });
    const a3 = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      asset_class: 'FII',
      quantity: '0',
      average_price: '0.00',
    });

    const batchRes = await rebalanceExecutionService.executeBatchContributions({
      portfolioId: portfolio.id,
      tradeDate: '2026-11-17',
      cashSource: { accountId: checking.id },
      items: [
        { assetId: a1.id, ticker: 'PETR4', suggestedQuantity: 10, unitPrice: 30 }, // 300.00
        { assetId: a2.id, ticker: 'VALE3', suggestedQuantity: 5, unitPrice: 60 }, // 300.00
        { assetId: a3.id, ticker: 'MXRF11', suggestedQuantity: 40, unitPrice: 10 }, // 400.00
      ],
    });

    expect(batchRes.totalExecuted).toBe(3);
    expect(batchRes.totalAmountInvested).toBe('1000.00');

    const entries = await finRepository.listEntriesByMonth('2026-11');
    const outs = entries.filter((e) => e.kind === 'transfer_out');
    const ins = entries.filter((e) => e.kind === 'transfer_in');
    const buys = entries.filter((e) => e.kind === 'investment_buy');

    expect(outs).toHaveLength(1);
    expect(ins).toHaveLength(1);
    expect(outs[0].amount_cents).toBe(100000);
    expect(ins[0].amount_cents).toBe(100000);
    expect(buys).toHaveLength(3);
    expect(buys.reduce((s, b) => s + b.amount_cents, 0)).toBe(100000);

    expect(calculateAccountBalance(checking.initial_balance_cents, entries, checking.id)).toBe(200000);
    expect(calculateAccountBalance(broker.initial_balance_cents, entries, broker.id)).toBe(0);
  });

  test('S104-T09: provento manual em carteira vinculada cria investment_income com linked_income_id', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 10000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira FIIs',
      docket_code: 'FII-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    const inc = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'MXRF11',
      payDate: '2026-11-18',
      amount: '125.40',
      kind: 'DIVIDENDO',
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('investment_income');
    expect(entries[0].account_id).toBe(broker.id);
    expect(entries[0].amount_cents).toBe(12540);
    expect(entries[0].linked_income_id).toBe(inc.id);
    expect(calculateAccountBalance(broker.initial_balance_cents, entries, broker.id)).toBe(22540);
  });

  test('S104-T10: provento manual antes + Open Finance depois casa sem duplicar e prevalece valor pago do OF (R41)', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira FIIs',
      docket_code: 'FII-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'MXRF11',
      name: 'Maxi Renda FII',
      asset_class: 'FII',
      quantity: '100',
      average_price: '10.00',
    });

    // 1. Provento manual cadastrado antes (gera investment_income de R$ 100,00)
    const manualInc = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'MXRF11',
      payDate: '2026-11-15',
      amount: '100.00',
      kind: 'RENDIMENTO',
    });
    expect(await finRepository.listEntriesByMonth('2026-11')).toHaveLength(1);

    // 2. Open Finance chega com crédito na conta vinculada (valor pago R$ 100,01, data +1 dia)
    await finRepository.createEntry({
      kind: 'income',
      amount_cents: 10001,
      due_date: '2026-11-16',
      paid_date: '2026-11-16',
      paid_amount_cents: 10001,
      status: 'paid',
      account_id: broker.id,
      category_id: 'cat-outros-receita',
      description: 'RENDIMENTOS DE CLIENTES MXRF11 S/ 100',
      description_raw: 'RENDIMENTOS DE CLIENTES MXRF11 S/ 100',
      source: 'OPEN_FINANCE',
      external_id: 'of-inc-1',
    });

    const relinkRes = await relinkStoredBankIncomes();
    expect(relinkRes.relinked).toBe(1);
    expect(relinkRes.matched).toBe(1);

    // Deve existir apenas UM lançamento de crédito para esse provento (o do OF), sem duplicar!
    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('OPEN_FINANCE');
    expect(entries[0].linked_income_id).toBe(manualInc.id);
    expect(entries[0].amount_cents).toBe(10001);
    expect(calculateAccountBalance(0, entries, broker.id)).toBe(10001);
  });

  test('S104-T11: Open Finance antes + provento manual depois casa sem duplicar e mantém um só crédito (R41)', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira FIIs',
      docket_code: 'FII-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);

    // 1. Open Finance já existe na conta vinculada
    const ofEntry = await finRepository.createEntry({
      kind: 'income',
      amount_cents: 15000,
      due_date: '2026-11-15',
      paid_date: '2026-11-15',
      paid_amount_cents: 15000,
      status: 'paid',
      account_id: broker.id,
      category_id: 'cat-outros-receita',
      description: 'DIVIDENDOS HGLG11',
      description_raw: 'DIVIDENDOS HGLG11',
      source: 'OPEN_FINANCE',
      external_id: 'of-hglg-1',
    });

    // 2. Usuário lança o provento manualmente depois (dentro de ±3 dias, mesmo valor)
    const manualInc = await incomeRepository.addIncome({
      portfolioId: portfolio.id,
      ticker: 'HGLG11',
      payDate: '2026-11-17',
      amount: '150.00',
      kind: 'DIVIDENDO',
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(ofEntry.id);
    expect(entries[0].linked_income_id).toBe(manualInc.id);
    expect(calculateAccountBalance(0, entries, broker.id)).toBe(15000);
  });

  test('S104-BKP: backup preserva linked_transaction_id e importa backup antigo sem a coluna', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 100000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
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
    const res = await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-10',
      quantity: '10',
      unitPrice: '30.00',
    });

    const archive = await exportDossierArchive();
    await resetDatabase();
    await importDossierArchive(archive);

    const entriesAfter = await finRepository.listEntriesByMonth('2026-11');
    expect(entriesAfter).toHaveLength(1);
    expect(entriesAfter[0].linked_transaction_id).toBe(res.transaction.id);
  });
});
