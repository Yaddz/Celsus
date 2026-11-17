import { eq } from 'drizzle-orm';
import { getDatabase, resetDatabase } from '../../../db/client';
import { incomeEvents } from '../../../db/schema';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../../repositories/portfolioRepository';
import { incomeRepository } from '../../../repositories/incomeRepository';
import { backupService } from '../../backupService';
import { filterIncomes } from '../../../domain/finance/incomeHistory';
import { PluggyClient } from '../pluggyClient';
import { pluggyInvestmentsSyncService } from '../pluggyInvestmentsSyncService';
import type {
  PluggyInvestment,
  PluggyInvestmentTransaction,
  PluggyItem,
} from '../types';

function makeClient(
  investments: PluggyInvestment[],
  txsByInv: Record<string, PluggyInvestmentTransaction[]>
): PluggyClient {
  const item: PluggyItem = {
    id: 'item-1',
    connector: { id: 1, name: 'XP' },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
  };
  const fetchImpl = jest.fn(async (url: string) => {
    if (url.endsWith('/auth')) {
      return new Response(JSON.stringify({ apiKey: 'k' }), { status: 200 });
    }
    if (url.includes('/items/')) {
      return new Response(JSON.stringify(item), { status: 200 });
    }
    if (url.includes('/investments/') && url.includes('/transactions')) {
      const invId = url.split('/investments/')[1].split('/transactions')[0];
      const list = txsByInv[invId] ?? [];
      return new Response(
        JSON.stringify({ page: 1, total: list.length, totalPages: 1, results: list }),
        { status: 200 }
      );
    }
    if (url.includes('/investments')) {
      return new Response(
        JSON.stringify({ page: 1, total: investments.length, totalPages: 1, results: investments }),
        { status: 200 }
      );
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

describe('Sprint 72 — Persistência de Proventos, Idempotência, Desconexão e Backup (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const fiiInv: PluggyInvestment = {
    id: 'inv-hglg',
    itemId: 'item-1',
    type: 'EQUITY',
    subtype: 'REAL_ESTATE_FUND',
    code: 'HGLG11',
    name: 'CSHG LOGISTICA FII',
    quantity: 50,
    balance: 8000,
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
  };

  it('S72-T14: INTEREST vira linha em income_events com portfolio_id do ativo, kind classificado e entra no total do histórico', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const client = makeClient([fiiInv], {
      'inv-hglg': [
        {
          id: 'tx-rend-1',
          type: 'INTEREST',
          amount: 55.0,
          quantity: 50,
          value: 1.1,
          date: '2026-10-15T00:00:00Z',
          description: 'Rendimento HGLG11',
        },
      ],
    });

    const res = await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });
    expect(res.counts.incomesCreated).toBe(1);

    const rows = await incomeRepository.listByPortfolio(port.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe('HGLG11');
    expect(rows[0].amount).toBe('55.00');
    expect(rows[0].kind).toBe('RENDIMENTO');
    expect(rows[0].source).toBe('OPEN_FINANCE');
    expect(rows[0].external_id).toBe('pluggy:tx-rend-1');

    const filtered = filterIncomes(
      rows.map((r) => ({
        id: r.id,
        portfolioId: r.portfolio_id,
        ticker: r.ticker,
        payDate: r.pay_date,
        amount: r.amount,
        kind: r.kind,
        source: r.source,
      })),
      { kind: 'RENDIMENTO' }
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].amount).toBe('55.00');
  });

  it('S72-T15: sincronizar duas vezes não cria linhas novas (idempotência por external_id)', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const client = makeClient([fiiInv], {
      'inv-hglg': [
        { id: 'tx-rend-1', type: 'INTEREST', amount: 55.0, date: '2026-10-15T00:00:00Z' },
      ],
    });

    await pluggyInvestmentsSyncService.syncInvestments('item-1', { client, defaultPortfolioId: port.id });
    const second = await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });

    expect(second.counts.incomesCreated).toBe(0);
    expect(second.counts.incomesSkipped).toBe(1);
    const rows = await incomeRepository.listByPortfolio(port.id);
    expect(rows).toHaveLength(1);
  });

  it('S72-T16: disconnectItemInvestments remove apenas proventos OPEN_FINANCE daquela conexão e preserva outras origens', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });

    // Provento manual confirmado
    await incomeRepository.addIncome({
      portfolioId: port.id,
      ticker: 'HGLG11',
      payDate: '2026-09-15',
      amount: '55.00',
      kind: 'RENDIMENTO',
      source: 'MANUAL',
    });

    const client = makeClient([fiiInv], {
      'inv-hglg': [
        { id: 'tx-rend-man', type: 'INTEREST', amount: 55.0, date: '2026-09-15T00:00:00Z' },
        { id: 'tx-rend-new', type: 'INTEREST', amount: 55.0, date: '2026-10-15T00:00:00Z' },
      ],
    });

    await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });
    expect(await incomeRepository.listByPortfolio(port.id)).toHaveLength(2);

    const disc = await pluggyInvestmentsSyncService.disconnectItemInvestments('item-1');
    expect(disc.removedIncomes).toBe(1);

    const remaining = await incomeRepository.listByPortfolio(port.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].source).toBe('MANUAL');
  });

  it('S72-T17: backup (.celsus.zip) preserva source, external_id, kind, quantity e unit_amount de income_events ida e volta', async () => {
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    await incomeRepository.addIncome({
      portfolioId: port.id,
      ticker: 'HGLG11',
      payDate: '2026-10-15',
      amount: '55.00',
      kind: 'RENDIMENTO',
      quantity: '50',
      unitAmount: '1.10',
      source: 'OPEN_FINANCE',
      externalId: 'pluggy:tx-rend-1',
    });

    const zipBytes = await backupService.createBackupZip();
    await resetDatabase();
    await backupService.restoreFromZip(zipBytes);

    const db = await getDatabase();
    const restored = await db.select().from(incomeEvents).where(eq(incomeEvents.ticker, 'HGLG11'));
    expect(restored).toHaveLength(1);
    expect(restored[0].source).toBe('OPEN_FINANCE');
    expect(restored[0].external_id).toBe('pluggy:tx-rend-1');
    expect(restored[0].kind).toBe('RENDIMENTO');
    expect(restored[0].quantity).toBe('50');
    expect(restored[0].unit_amount).toBe('1.10');
  });
});
