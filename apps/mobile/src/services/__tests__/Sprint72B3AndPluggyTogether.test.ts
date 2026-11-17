import { applySchemaUpgrades, getDatabase, getRawSqliteDatabase, resetDatabase } from '../../db/client';
import { appMeta, incomeEvents } from '../../db/schema';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { b3ImportService } from '../b3ImportService';
import { PluggyClient } from '../pluggy/pluggyClient';
import { pluggyInvestmentsSyncService } from '../pluggy/pluggyInvestmentsSyncService';
import type { PluggyInvestment, PluggyInvestmentTransaction, PluggyItem } from '../pluggy/types';
import { eq } from 'drizzle-orm';

function makePluggyClient(
  investments: PluggyInvestment[],
  txsByInv: Record<string, PluggyInvestmentTransaction[]>
): PluggyClient {
  const item: PluggyItem = {
    id: 'item-1',
    connector: { id: 1, name: 'Itaú' },
    status: 'UPDATED',
    executionStatus: 'SUCCESS',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
  };
  const fetchImpl = jest.fn(async (url: string) => {
    if (url.endsWith('/auth')) return new Response(JSON.stringify({ apiKey: 'k' }), { status: 200 });
    if (url.includes('/items/')) return new Response(JSON.stringify(item), { status: 200 });
    if (url.includes('/investments/') && url.includes('/transactions')) {
      const invId = url.split('/investments/')[1].split('/transactions')[0];
      const list = txsByInv[invId] ?? [];
      return new Response(JSON.stringify({ page: 1, total: list.length, totalPages: 1, results: list }), { status: 200 });
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

function makeB3Csv(rows: string[]): Uint8Array {
  const header = 'Entrada/Saída;Data;Movimentação;Produto;Instituição;Quantidade;Preço unitário;Valor da operação';
  return new TextEncoder().encode([header, ...rows].join('\n'));
}

describe('Sprint 72 — B3 e Pluggy em Conjunto (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const petrInv: PluggyInvestment = {
    id: 'inv-petr',
    itemId: 'item-1',
    type: 'EQUITY',
    subtype: 'STOCK',
    code: 'PETR4',
    name: 'PETROBRAS PN',
    quantity: 100,
    balance: 3500,
    currencyCode: 'BRL',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
  };

  it('S72-T18: B3 importada ANTES da Pluggy — Pluggy reconhece equivalente, não duplica e marca Confirmado pelo Open Finance', async () => {
    await openFinanceRepository.addItem('item-1');
    const portB3 = await portfolioRepository.createPortfolio({ name: 'B3', docket_code: 'B3-01' });
    const portPluggy = await portfolioRepository.createPortfolio({ name: 'Pluggy', docket_code: 'PG-01' });

    const csv = makeB3Csv([
      'Credito;15/06/2026;Dividendo;PETR4 - PETROBRAS;ITAU CORRETORA;100;R$ 1,20;R$ 120,00',
    ]);
    const plan = await b3ImportService.preview(csv, 'extrato.csv', { portfolioId: portB3.id });
    await b3ImportService.apply(plan, { portfolioId: portB3.id });

    const client = makePluggyClient([petrInv], {
      'inv-petr': [
        {
          id: 'tx-div-1',
          type: 'INTEREST',
          amount: 120.0,
          date: '2026-06-16T00:00:00Z', // D+1
          description: 'Dividendos PETR4',
        },
      ],
    });

    const res = await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: portPluggy.id,
    });

    expect(res.counts.incomesCreated).toBe(0);
    expect(res.counts.incomesMatched).toBe(1);

    const allIncomes = await incomeRepository.listAll();
    expect(allIncomes).toHaveLength(1);
    expect(allIncomes[0].notes).toContain('Confirmado pelo Open Finance');
  });

  it('S72-T19: Pluggy sincronizada ANTES da B3 — preview marca "já sincronizado pelo Open Finance" e apply não duplica', async () => {
    await openFinanceRepository.addItem('item-1');
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });

    const client = makePluggyClient([petrInv], {
      'inv-petr': [
        {
          id: 'tx-jcp-1',
          type: 'INTEREST',
          amount: 85.0, // líquido de 100.00 (15% IR)
          date: '2026-07-10T00:00:00Z',
          description: 'JCP PETR4',
        },
      ],
    });
    await pluggyInvestmentsSyncService.syncInvestments('item-1', {
      client,
      defaultPortfolioId: port.id,
    });

    const csv = makeB3Csv([
      'Credito;10/07/2026;Juros Sobre Capital Próprio;PETR4 - PETROBRAS;ITAU CORRETORA;100;R$ 1,00;R$ 100,00',
    ]);
    const plan = await b3ImportService.preview(csv, 'extrato.csv', { portfolioId: port.id });
    expect(plan.duplicates.some((d) => d.reason.includes('já sincronizado pelo Open Finance'))).toBe(true);

    const report = await b3ImportService.apply(plan, { portfolioId: port.id });
    expect(report.imported.incomes).toBe(0);
    expect(await incomeRepository.listAll()).toHaveLength(1);
  });

  it('S72-T20: migração de limpeza remove duplicatas antigas entre origens, mantém mais antiga e grava contagem em app_meta', async () => {
    const port = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PRN-01' });
    const db = await getDatabase();
    await db.insert(incomeEvents).values([
      {
        id: 'inc-old',
        portfolio_id: port.id,
        ticker: 'VALE3',
        pay_date: '2026-05-10',
        amount: '200.00',
        notes: 'Importado B3',
        source: 'B3_IMPORT',
        external_id: 'b3:1',
        kind: null,
        quantity: null,
        unit_amount: null,
        created_at: '2026-05-10T10:00:00Z',
      },
      {
        id: 'inc-dup',
        portfolio_id: port.id,
        ticker: 'VALE3',
        pay_date: '2026-05-11',
        amount: '200.00',
        notes: 'Pluggy',
        source: 'OPEN_FINANCE',
        external_id: 'pluggy:dup-1',
        kind: 'DIVIDENDO',
        quantity: '50',
        unit_amount: '4.00',
        created_at: '2026-05-12T10:00:00Z',
      },
    ]);

    await applySchemaUpgrades(getRawSqliteDatabase());

    const remaining = await incomeRepository.listAll();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('inc-old');
    expect(remaining[0].kind).toBe('DIVIDENDO');
    expect(remaining[0].quantity).toBe('50');

    const metaRows = await db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, 'migration:income_dedup_removed'));
    expect(metaRows[0]?.value).toBe('1');
  });
});
