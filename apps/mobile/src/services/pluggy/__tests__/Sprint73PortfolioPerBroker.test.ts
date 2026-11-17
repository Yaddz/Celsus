import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { assets, portfolios } from '../../../db/schema';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { assetRepository } from '../../../repositories/assetRepository';
import { PluggyClient } from '../pluggyClient';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import { ensurePortfolioForItem, resolveBrokerDisplayName } from '../pluggyPortfolioService';
import type { PluggyInvestment, PluggyItem } from '../types';

function makeClient(
  item: PluggyItem,
  investments: PluggyInvestment[]
): PluggyClient {
  const fetchImpl = jest.fn(async (url: string) => {
    if (url.endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'k' }), { status: 200 });
    if (url.includes('/items/')) return new Response(JSON.stringify(item), { status: 200 });
    if (url.includes('/transactions')) {
      return new Response(JSON.stringify({ page: 1, total: 0, totalPages: 1, results: [] }), { status: 200 });
    }
    if (url.includes('/investments')) {
      return new Response(JSON.stringify({ page: 1, total: investments.length, totalPages: 1, results: investments }), { status: 200 });
    }
    return new Response(JSON.stringify({ results: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  const storage = {
    getItem: jest.fn(async (k: string) =>
      k === 'pluggy.client_id' ? 'cid' : k === 'pluggy.client_secret' ? 'csec' : null
    ),
    setItem: jest.fn(async () => {}),
    deleteItem: jest.fn(async () => {}),
  };

  return new PluggyClient({ fetchImpl, storage, maxRetries: 0, baseDelayMs: 0 });
}

describe('Sprint 73 — Carteira Automática por Corretora (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('S73-T01: caso (c) cria carteira nova com nome da corretora, descrição padrão e of_item_id quando não há carteiras', async () => {
    const res = await ensurePortfolioForItem('item-xp-1234', 'XP Investimentos');
    expect(res.created).toBe(true);
    expect(res.portfolio.name).toBe('XP Investimentos');
    expect(res.portfolio.description).toBe('Sincronizada pelo Open Finance');
    expect(res.portfolio.of_item_id).toBe('item-xp-1234');
    expect(res.portfolio.docket_code).toMatch(/^REV-CART-\d{3}/);
  });

  it('S73-T02: caso (a) reutiliza carteira já vinculada por of_item_id, desarquiva se arquivada e nunca sobrescreve nome editado pelo usuário', async () => {
    const first = await ensurePortfolioForItem('item-btg-9999', 'BTG Pactual');
    await portfolioRepository.updatePortfolio(first.portfolio.id, {
      name: 'Minha Carteira BTG',
      is_archived: 1,
    });

    const second = await ensurePortfolioForItem('item-btg-9999', 'BTG Pactual');
    expect(second.created).toBe(false);
    expect(second.portfolio.id).toBe(first.portfolio.id);
    expect(second.portfolio.name).toBe('Minha Carteira BTG');
    expect(second.portfolio.is_archived).toBe(0);
  });

  it('S73-T03: caso (b) vincula carteira manual existente com nome normalizado igual ao da corretora em vez de duplicar', async () => {
    const manual = await portfolioRepository.createPortfolio({
      name: 'Itau   Corretora',
      docket_code: 'MAN-001',
    });

    const res = await ensurePortfolioForItem('item-itau-1', 'Itaú Corretora');
    expect(res.created).toBe(false);
    expect(res.portfolio.id).toBe(manual.id);
    expect(res.portfolio.of_item_id).toBe('item-itau-1');
    expect(await portfolioRepository.listPortfolios(false)).toHaveLength(1);
  });

  it('S73-T04: nome genérico (vazio, igual ao id, ou "MeuPluggy") vira "Corretora <4 últimos chars>" e institution.name prevalece', () => {
    expect(resolveBrokerDisplayName('abcd-1234', 'MeuPluggy')).toBe('Corretora 1234');
    expect(resolveBrokerDisplayName('abcd-5678', '')).toBe('Corretora 5678');
    expect(resolveBrokerDisplayName('abcd-9999', 'abcd-9999')).toBe('Corretora 9999');
    expect(
      resolveBrokerDisplayName('item-1', 'MeuPluggy', { institution: { name: 'Clear Corretora' } })
    ).toBe('Clear Corretora');
  });

  it('S73-T05: duas conexões criam duas carteiras; conexão só com contas bancárias (0 investimentos) não cria carteira', async () => {
    await openFinanceRepository.addItem('item-1');
    await openFinanceRepository.addItem('item-2');
    await openFinanceRepository.addItem('item-bank-only');

    const c1 = makeClient(
      { id: 'item-1', connector: { id: 1, name: 'XP' }, status: 'UPDATED', executionStatus: 'SUCCESS', createdAt: '', updatedAt: '' },
      [{ id: 'inv-1', itemId: 'item-1', type: 'EQUITY', subtype: 'STOCK', code: 'PETR4', name: 'PETROBRAS', quantity: 10, balance: 350, currencyCode: 'BRL', status: 'ACTIVE', createdAt: '', updatedAt: '' }]
    );
    const c2 = makeClient(
      { id: 'item-2', connector: { id: 2, name: 'BTG' }, status: 'UPDATED', executionStatus: 'SUCCESS', createdAt: '', updatedAt: '' },
      [{ id: 'inv-2', itemId: 'item-2', type: 'EQUITY', subtype: 'STOCK', code: 'VALE3', name: 'VALE', quantity: 5, balance: 300, currencyCode: 'BRL', status: 'ACTIVE', createdAt: '', updatedAt: '' }]
    );
    const cBank = makeClient(
      { id: 'item-bank-only', connector: { id: 3, name: 'Nubank' }, status: 'UPDATED', executionStatus: 'SUCCESS', createdAt: '', updatedAt: '' },
      []
    );

    await pluggyInvestmentsSyncService.syncInvestments('item-1', { client: c1 });
    await pluggyInvestmentsSyncService.syncInvestments('item-2', { client: c2 });
    await pluggyInvestmentsSyncService.syncInvestments('item-bank-only', { client: cBank });

    const allPorts = await portfolioRepository.listPortfolios(false);
    expect(allPorts).toHaveLength(2);
    expect(allPorts.map((p) => p.name).sort()).toEqual(['BTG', 'XP']);
  });

  it('S73-T06: ativo já vinculado (ou movido pelo usuário para outra carteira) fica onde está; casamento HIGH atualiza no lugar', async () => {
    await openFinanceRepository.addItem('item-1');
    const customPort = await portfolioRepository.createPortfolio({
      name: 'Minha Carteira Especial',
      docket_code: 'ESP-01',
    });
    const movedAsset = await assetRepository.createAsset({
      portfolio_id: customPort.id,
      asset_class: 'STOCK',
      ticker: 'ITUB4',
      name: 'Itaú',
      quantity: '50',
      average_price: '30.00',
      source: 'OPEN_FINANCE',
      external_id: 'inv-itub',
    });

    const client = makeClient(
      { id: 'item-1', connector: { id: 1, name: 'XP' }, status: 'UPDATED', executionStatus: 'SUCCESS', createdAt: '', updatedAt: '' },
      [
        { id: 'inv-itub', itemId: 'item-1', type: 'EQUITY', subtype: 'STOCK', code: 'ITUB4', name: 'ITAU', quantity: 60, balance: 2000, currencyCode: 'BRL', status: 'ACTIVE', createdAt: '', updatedAt: '' },
        { id: 'inv-new', itemId: 'item-1', type: 'EQUITY', subtype: 'STOCK', code: 'WEGE3', name: 'WEG', quantity: 20, balance: 1000, currencyCode: 'BRL', status: 'ACTIVE', createdAt: '', updatedAt: '' },
      ]
    );

    await pluggyInvestmentsSyncService.syncInvestments('item-1', { client });

    const db = await getDatabase();
    const [afterMoved] = await db.select().from(assets).where(eq(assets.id, movedAsset.id));
    expect(afterMoved.portfolio_id).toBe(customPort.id);
    expect(afterMoved.quantity).toBe('60');

    const [createdNew] = await db.select().from(assets).where(eq(assets.external_id, 'inv-new'));
    expect(createdNew).toBeTruthy();
    expect(createdNew.portfolio_id).not.toBe(customPort.id);
  });
});
