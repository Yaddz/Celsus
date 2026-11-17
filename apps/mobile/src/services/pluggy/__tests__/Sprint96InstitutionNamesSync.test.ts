/**
 * Sprint 96 — Sync: contas e carteiras de conexões Meu Pluggy com o nome real da instituição.
 */
import { resetDatabase } from '../../../db/client';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { pluggySyncService } from '../pluggySyncService';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { makePluggyItem, makeSprint84OpenApiInvestment } from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';
import type { PluggyAccount, PluggyInvestment } from '../types';

const MEU_PLUGGY = {
  id: 200,
  name: 'MeuPluggy',
  type: 'PERSONAL_BANK',
  country: 'BR',
} as any;

function acc(overrides: Partial<PluggyAccount>): PluggyAccount {
  return {
    id: 'acc',
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: '0012343671',
    name: 'Conta Corrente',
    balance: 0,
    itemId: 'item',
    currencyCode: 'BRL',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
    ...overrides,
  } as PluggyAccount;
}

function mkClient(itemId: string, accounts: PluggyAccount[], investments: PluggyInvestment[] = []) {
  return {
    getItem: async () => makePluggyItem({ id: itemId, connector: MEU_PLUGGY }),
    listAccounts: async () => accounts.map((a) => ({ ...a, itemId })),
    listTransactions: async () => [],
    listBills: async () => [],
    listInvestments: async () => investments,
    listInvestmentTransactions: async () => [],
  } as unknown as PluggyClient;
}

describe('Sprint 96 — nomes reais em conexões Meu Pluggy', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S96-T09: sync de finanças nomeia conta e cartão pelo banco do COMPE; nome editado pelo usuário é mantido', async () => {
    await openFinanceRepository.addItem('item-nu');
    const checking = acc({ id: 'pg-chk', bankData: { transferNumber: '260/0001/1234367-1' } as any });
    const card = acc({
      id: 'pg-card',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      number: '**** 8926',
      name: 'platinum',
      creditData: { creditLimit: 1000, availableCreditLimit: 500 } as any,
    });
    const renamed = acc({
      id: 'pg-other',
      number: '0099992994',
      bankData: { transferNumber: '260/0001/9999299-4' } as any,
    });
    await finRepository.createAccount({
      name: 'Minha conta do dia a dia',
      autoName: 'MeuPluggy · Conta corrente ·· 2994',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-other',
    });

    await pluggySyncService.syncFinance('item-nu', { client: mkClient('item-nu', [checking, card, renamed]) });

    const local = await finRepository.listAccounts(true);
    const byPg = new Map(local.map((a) => [a.of_account_id, a]));
    expect(byPg.get('pg-chk')!.name).toBe('Nubank · Conta corrente ·· 3671');
    expect(byPg.get('pg-card')!.name).toBe('Nubank · Platinum ·· 8926');
    expect(byPg.get('pg-other')!.name).toBe('Minha conta do dia a dia');
    expect(byPg.get('pg-other')!.auto_name).toBe('Nubank · Conta corrente ·· 2994');
  });

  it('S96-T10: conta já gravada com o nome genérico "MeuPluggy · …" é renomeada na próxima sync', async () => {
    await openFinanceRepository.addItem('item-xp');
    await finRepository.createAccount({
      name: 'MeuPluggy · Conta corrente ·· 9415',
      autoName: 'MeuPluggy · Conta corrente ·· 9415',
      type: 'checking',
      source: 'OPEN_FINANCE',
      ofAccountId: 'pg-xp',
    });
    const xpChecking = acc({
      id: 'pg-xp',
      number: '0000009415',
      bankData: { transferNumber: '348/0001/0000941-5' } as any,
    });

    await pluggySyncService.syncFinance('item-xp', { client: mkClient('item-xp', [xpChecking]) });

    const local = await finRepository.listAccounts(true);
    expect(local.find((a) => a.of_account_id === 'pg-xp')!.name).toBe('XP · Conta corrente ·· 9415');
  });

  it('S96-T11: carteira "Corretora xxxx" da conexão vira o nome da corretora; carteira renomeada pelo usuário fica', async () => {
    const itemId = 'd688b0a9-0591-4c45-ae1a-74c5392cd2f7';
    await openFinanceRepository.addItem(itemId);
    const generic = await portfolioRepository.createPortfolio({
      name: 'Corretora d2f7',
      docket_code: 'REV-CART-001',
      of_item_id: itemId,
    } as any);
    const inv = makeSprint84OpenApiInvestment({
      id: 'inv-petr',
      itemId,
      type: 'EQUITY',
      subtype: 'STOCK',
      code: 'PETR4',
      name: 'PETR4',
      quantity: 2,
      value: 45.21,
      balance: 90.42,
      amount: 90.42,
      amountOriginal: null,
      institution: { name: 'MeuPluggy', number: null } as any,
    });
    const btgChecking = acc({ id: 'pg-btg', bankData: { transferNumber: '208/0001/1234567-8' } as any });

    await pluggyInvestmentsSyncService.syncInvestments(itemId, { client: mkClient(itemId, [btgChecking], [inv]) });
    const after = await portfolioRepository.getPortfolioById(generic.id);
    expect(after!.name).toBe('BTG Pactual');
    const assets = await assetRepository.getAssetsByPortfolio(generic.id);
    expect(assets.map((a) => a.ticker)).toEqual(['PETR4']);

    // Usuário renomeia: a sync seguinte não mexe
    await portfolioRepository.updatePortfolio(generic.id, { name: 'Ações de longo prazo' });
    await pluggyInvestmentsSyncService.syncInvestments(itemId, { client: mkClient(itemId, [btgChecking], [inv]) });
    expect((await portfolioRepository.getPortfolioById(generic.id))!.name).toBe('Ações de longo prazo');
  });

  it('S96-T12: recibo de subscrição já gravado como ação passa a FII na próxima sync', async () => {
    const itemId = '09db5346-8449-4d31-b3b3-164c63046ef1';
    await openFinanceRepository.addItem(itemId);
    const portfolio = await portfolioRepository.createPortfolio({ name: 'XP', docket_code: 'XP01' });
    const receipt = makeSprint84OpenApiInvestment({
      id: 'inv-mxrf13',
      itemId,
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
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      asset_class: 'STOCK',
      ticker: 'MXRF13',
      name: 'Mxrf13',
      auto_name: 'Mxrf13',
      quantity: '0',
      average_price: '',
      source: 'OPEN_FINANCE',
      external_id: 'inv-mxrf13',
      institution_id: itemId,
      of_status: 'TOTAL_WITHDRAWAL',
    } as any);

    await pluggyInvestmentsSyncService.syncInvestments(itemId, {
      client: mkClient(itemId, [], [receipt]),
      defaultPortfolioId: portfolio.id,
    });
    const [asset] = await assetRepository.getAssetsByPortfolio(portfolio.id);
    expect(asset.asset_class).toBe('FII');
    expect(asset.name).toBe('Recibo de subscrição MXRF11');
  });
});
