import { getRawSqliteDatabase, resetDatabase } from '../../db/client';
import {
  calculateAccountBalance,
  detectOverdueAndDueSoonWithBills,
} from '../../domain/financeFlow';
import { finRepository } from '../../repositories/finRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { backupService } from '../../services/backupService';
import { finService } from '../../services/finService';
import { ensurePortfolioForItem } from '../../services/pluggy/pluggyPortfolioService';

describe('Sprint 103 — R39 Conta corretora, schema, backup, migração e financeFlow', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  test('S103-T07: schema possui fin_account_id em portfolios e fin_accounts aceita type broker', async () => {
    const raw = getRawSqliteDatabase();
    const cols = raw.getAllSync<{ name: string }>('PRAGMA table_info(portfolios)');
    expect(cols.some((c) => c.name === 'fin_account_id')).toBe(true);

    const brokerAcc = await finRepository.createAccount({
      name: 'XP Corretora',
      type: 'broker',
      initialBalanceCents: 0,
    });
    expect(brokerAcc.type).toBe('broker');
    expect(brokerAcc.closing_day).toBeNull();
    expect(brokerAcc.due_day).toBeNull();
    expect(brokerAcc.credit_limit_cents).toBeNull();
  });

  test('S103-T08: backup antigo sem fin_account_id importa; backup novo preserva fin_account_id e type broker', async () => {
    const brokerAcc = await finRepository.createAccount({
      name: 'BTG Pactual',
      type: 'broker',
      initialBalanceCents: 15000,
    });
    const p = await portfolioRepository.createPortfolio({
      name: 'BTG Pactual',
      docket_code: 'REV-CART-001',
    });
    await portfolioRepository.linkFinAccount(p.id, brokerAcc.id);

    const zipBytes = await backupService.createBackupZip();
    await resetDatabase();
    await backupService.restoreFromZip(zipBytes);

    const restoredPortfolios = await portfolioRepository.listPortfolios(true);
    expect(restoredPortfolios).toHaveLength(1);
    expect(restoredPortfolios[0].fin_account_id).toBe(brokerAcc.id);

    const restoredBrokers = await finRepository.listBrokerAccounts();
    expect(restoredBrokers).toHaveLength(1);
    expect(restoredBrokers[0].id).toBe(brokerAcc.id);
    expect(restoredBrokers[0].type).toBe('broker');

    // Simula backup antigo sem a coluna fin_account_id no snapshot
    const oldSnapshot: any = {
      version: 1,
      createdAt: new Date().toISOString(),
      portfolios: [
        {
          id: 'p-old-1',
          name: 'Carteira Antiga',
          description: null,
          docket_code: 'REV-CART-002',
          patrimony_goal: null,
          monthly_contribution: null,
          of_item_id: null,
          is_archived: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      classTargets: [],
      assets: [],
      transactions: [],
      incomeEvents: [],
      finAccounts: [],
      finCategories: [],
      finEntries: [],
      finRecurrences: [],
      finBudgets: [],
    };
    const oldZip = await backupService.createBackupZip(oldSnapshot);
    await resetDatabase();
    await backupService.restoreFromZip(oldZip);
    const oldRestored = await portfolioRepository.listPortfolios(true);
    expect(oldRestored).toHaveLength(1);
    expect(oldRestored[0].fin_account_id).toBeNull();
  });

  test('S103-T09: linkFinAccount, getLinkedAccount e listBrokerAccounts', async () => {
    const accChecking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 100000,
    });
    const accBroker = await finRepository.createAccount({
      name: 'Clear',
      type: 'broker',
      initialBalanceCents: 0,
    });
    const p = await portfolioRepository.createPortfolio({
      name: 'Ações',
      docket_code: 'REV-CART-001',
    });

    expect(await portfolioRepository.getLinkedAccount(p.id)).toBeNull();

    await portfolioRepository.linkFinAccount(p.id, accBroker.id);
    const linked = await portfolioRepository.getLinkedAccount(p.id);
    expect(linked?.id).toBe(accBroker.id);
    expect(linked?.type).toBe('broker');

    const brokers = await finRepository.listBrokerAccounts();
    expect(brokers.map((b) => b.id)).toEqual([accBroker.id]);
    expect(brokers.some((b) => b.id === accChecking.id)).toBe(false);

    // Desvincular
    await portfolioRepository.linkFinAccount(p.id, null);
    expect(await portfolioRepository.getLinkedAccount(p.id)).toBeNull();
  });

  test('S103-T10: migração migration:broker-accounts:v1 cria 2 contas broker para 2 carteiras Pluggy diferentes e vincula', async () => {
    const pXp = await portfolioRepository.createPortfolio({
      name: 'XP Investimentos',
      docket_code: 'REV-CART-001',
      of_item_id: 'item-xp-1',
    });
    const pBtg = await portfolioRepository.createPortfolio({
      name: 'BTG Pactual',
      docket_code: 'REV-CART-002',
      of_item_id: 'item-btg-2',
    });

    await finService.initializeFinanceModule('2026-11-26');

    const brokers = await finRepository.listBrokerAccounts();
    expect(brokers).toHaveLength(2);
    expect(brokers.map((b) => b.name).sort()).toEqual(['BTG Pactual', 'XP Investimentos']);
    expect(brokers.every((b) => b.initial_balance_cents === 0)).toBe(true);

    const linkedXp = await portfolioRepository.getLinkedAccount(pXp.id);
    const linkedBtg = await portfolioRepository.getLinkedAccount(pBtg.id);
    expect(linkedXp?.name).toBe('XP Investimentos');
    expect(linkedBtg?.name).toBe('BTG Pactual');
  });

  test('S103-T11: migração migration:broker-accounts:v1 não toca carteira manual (of_item_id null)', async () => {
    const pManual = await portfolioRepository.createPortfolio({
      name: 'Carteira Manual',
      docket_code: 'REV-CART-001',
    });

    await finService.initializeFinanceModule('2026-11-26');

    const brokers = await finRepository.listBrokerAccounts();
    expect(brokers).toHaveLength(0);
    expect(await portfolioRepository.getLinkedAccount(pManual.id)).toBeNull();
  });

  test('S103-T12: segunda execução da migração não duplica contas; ensurePortfolioForItem cria conta par em carteira nova', async () => {
    await portfolioRepository.createPortfolio({
      name: 'Rico',
      docket_code: 'REV-CART-001',
      of_item_id: 'item-rico-1',
    });

    await finService.initializeFinanceModule('2026-11-26');
    await finService.initializeFinanceModule('2026-11-26');

    let brokers = await finRepository.listBrokerAccounts();
    expect(brokers).toHaveLength(1);

    // Nova carteira via Pluggy após a migração já cria conta par automaticamente
    const ensured = await ensurePortfolioForItem('item-inter-2', 'Banco Inter');
    expect(ensured.created).toBe(true);

    brokers = await finRepository.listBrokerAccounts();
    expect(brokers).toHaveLength(2);
    const linkedInter = await portfolioRepository.getLinkedAccount(ensured.portfolio.id);
    expect(linkedInter?.type).toBe('broker');
    expect(linkedInter?.name).toBe('Banco Inter');
  });

  test('S103-T13: saldo de conta broker = saldo inicial + transferências (regra comum) e não aparece em faturas', async () => {
    const brokerAcc = await finRepository.createAccount({
      name: 'XP Corretora',
      type: 'broker',
      initialBalanceCents: 10000, // R$ 100,00
    });
    const checkingAcc = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 50000,
    });

    await finRepository.createTransfer({
      fromAccountId: checkingAcc.id,
      toAccountId: brokerAcc.id,
      amountCents: 25000, // + R$ 250,00
      dateIso: '2026-11-10',
      description: 'Aporte XP',
    });

    const entries = await finRepository.listAllEntries();
    // Saldo esperado: 10000 + 25000 = 35000 (R$ 350,00)
    const balance = calculateAccountBalance(brokerAcc, entries);
    expect(balance).toBe(35000);

    // Conta broker não gera faturas
    const attention = detectOverdueAndDueSoonWithBills(
      entries,
      [brokerAcc, checkingAcc],
      '2026-11-26'
    );
    expect(attention.overdueBills).toHaveLength(0);
    expect(attention.dueSoonBills).toHaveLength(0);
  });
});
