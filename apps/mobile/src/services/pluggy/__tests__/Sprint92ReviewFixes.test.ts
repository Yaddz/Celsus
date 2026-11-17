import { resetDatabase } from '../../../db/client';
import { appMetaRepository } from '../../../repositories/appMetaRepository';
import { finRepository } from '../../../repositories/finRepository';
import { openFinanceRepository } from '../../../repositories/openFinanceRepository';
import { pluggySyncService } from '../pluggySyncService';
import { makePluggyAccounts, makePluggyItem } from './pluggyFixtures';
import type { PluggyClient } from '../pluggyClient';
import type { PluggyAccount, PluggyTransaction } from '../types';

const NOW = new Date('2026-11-17T12:00:00Z');
const now = () => NOW;

function mkTx(overrides: Partial<PluggyTransaction> & { id: string; accountId: string }): PluggyTransaction {
  const date = overrides.date ?? '2026-11-14T12:00:00Z';
  return {
    description: 'X',
    currencyCode: 'BRL',
    amount: -1,
    type: 'DEBIT',
    status: 'POSTED',
    category: null,
    categoryId: null,
    createdAt: date,
    updatedAt: date,
    date,
    ...overrides,
  } as PluggyTransaction;
}

type Call = { accountId: string; params: Record<string, unknown> };

/** Cliente que devolve só as transações dentro do filtro pedido (dateFrom / createdAtFrom). */
function mkClient(itemId: string, accounts: PluggyAccount[], txsByAccount: Record<string, PluggyTransaction[]>, calls: Call[] = []) {
  return {
    getItem: async () => makePluggyItem({ id: itemId }),
    listAccounts: async () => accounts.map((a) => ({ ...a, itemId })),
    listTransactions: async (accId: string, params: Record<string, unknown> = {}) => {
      calls.push({ accountId: accId, params });
      const all = txsByAccount[accId] ?? [];
      if (typeof params.dateFrom === 'string') {
        return all.filter((t) => t.date.slice(0, 10) >= (params.dateFrom as string));
      }
      if (typeof params.createdAtFrom === 'string') {
        return all.filter((t) => (t.createdAt ?? t.date) >= (params.createdAtFrom as string));
      }
      return all;
    },
    listBills: async () => [],
    listInvestments: async () => [],
    listInvestmentTransactions: async () => [],
  } as unknown as PluggyClient;
}

const checking = (id: string): PluggyAccount => ({ ...makePluggyAccounts()[0], id });

describe('Sprint 92 — Correções da revisão das sprints 90 e 91 (serviços, Fase A)', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('S92-T07: conexão já sincronizada antes da 92 busca o histórico completo uma vez e reclassifica lançamentos antigos (04 vira transferência, 11020000 vira Alimentação)', async () => {
    await finRepository.seedDefaultCategoriesIfNeeded();
    await openFinanceRepository.addItem('item-old');
    const oldPix = mkTx({
      id: 'old-pix',
      accountId: 'acc-old',
      description: 'Pix enviado para conta própria',
      amount: -2000,
      categoryId: '04000000',
      category: 'Same person transfer',
      date: '2026-08-20T12:00:00Z',
      createdAt: '2026-08-20T12:00:00Z',
    });
    const oldFood = mkTx({
      id: 'old-food',
      accountId: 'acc-old',
      description: 'IFOOD',
      amount: -66.58,
      categoryId: '11020000',
      category: 'Food delivery',
      date: '2026-08-21T12:00:00Z',
      createdAt: '2026-08-21T12:00:00Z',
    });
    const txs = { 'acc-old': [oldPix, oldFood] };

    // 1ª sync (histórico completo) e, em seguida, simula uma base anterior à Sprint 92:
    // lançamentos sem of_category_id, em "Outros", e sem a marca de histórico completo.
    await pluggySyncService.syncFinance('item-old', { client: mkClient('item-old', [checking('acc-old')], txs), now });
    for (const e of await finRepository.listAllEntries()) {
      await finRepository.updateEntry(e.id, {
        kind: 'expense',
        category_id: 'cat-outros-despesa',
        of_category_id: null,
        of_class_reason: null,
      });
    }
    await appMetaRepository.set('fin:of:backfill:s92:item-old', '');

    const calls: Call[] = [];
    await pluggySyncService.syncFinance('item-old', {
      client: mkClient('item-old', [checking('acc-old')], txs, calls),
      now,
    });

    // Mantém as duas passadas da R10 e acrescenta a busca do histórico completo
    expect(calls.some((c) => typeof c.params.createdAtFrom === 'string')).toBe(true);
    expect(calls.some((c) => c.params.dateFrom === '2026-10-08')).toBe(true);
    expect(calls.some((c) => c.params.dateFrom === '2025-11-17')).toBe(true);

    const byExt = new Map((await finRepository.listAllEntries()).map((e) => [e.external_id, e]));
    expect(byExt.get('old-pix')!.kind).toBe('transfer_out');
    expect(byExt.get('old-pix')!.of_category_id).toBe('04000000');
    expect(byExt.get('old-food')!.category_id).toBe('cat-alimentacao');

    // Na sync seguinte não busca o histórico de novo
    const nextCalls: Call[] = [];
    await pluggySyncService.syncFinance('item-old', {
      client: mkClient('item-old', [checking('acc-old')], txs, nextCalls),
      now,
    });
    expect(nextCalls.some((c) => c.params.dateFrom === '2025-11-17')).toBe(false);
  });

  it('S92-T08: depois da busca do histórico, Pix 05 entre conexões com mais de 40 dias também é pareado', async () => {
    await openFinanceRepository.addItem('item-a');
    await openFinanceRepository.addItem('item-b');
    const txsA = {
      'acc-a': [
        mkTx({
          id: 'old-out',
          accountId: 'acc-a',
          description: 'Transferência enviada pelo Pix',
          amount: -432.79,
          categoryId: '05070000',
          category: 'Transfer - PIX',
          date: '2026-08-06T12:00:00Z',
          createdAt: '2026-08-06T12:00:00Z',
        }),
      ],
    };
    const txsB = {
      'acc-b': [
        mkTx({
          id: 'old-in',
          accountId: 'acc-b',
          description: 'Pix recebido',
          amount: 432.79,
          type: 'CREDIT',
          categoryId: '05070000',
          category: 'Transfer - PIX',
          date: '2026-08-06T12:00:00Z',
          createdAt: '2026-08-06T12:00:00Z',
        }),
      ],
    };
    await pluggySyncService.syncFinance('item-a', { client: mkClient('item-a', [checking('acc-a')], txsA), now });
    await pluggySyncService.syncFinance('item-b', { client: mkClient('item-b', [checking('acc-b')], txsB), now });

    const byExt = new Map((await finRepository.listAllEntries()).map((e) => [e.external_id, e]));
    expect(byExt.get('old-out')!.kind).toBe('transfer_out');
    expect(byExt.get('old-in')!.kind).toBe('transfer_in');
    expect(byExt.get('old-out')!.transfer_group_id).toBe(byExt.get('old-in')!.transfer_group_id);
  });

  it('S92-T09: Pix 04 já pareado entre conexões mantém o motivo OWN_ACCOUNT_PAIRED nas sincronizações seguintes', async () => {
    await openFinanceRepository.addItem('item-a');
    await openFinanceRepository.addItem('item-b');
    const txsA = {
      'acc-a': [
        mkTx({
          id: 'pix-out',
          accountId: 'acc-a',
          description: 'Pix enviado',
          amount: -227.17,
          categoryId: '04000000',
          category: 'Same person transfer',
        }),
      ],
    };
    const txsB = {
      'acc-b': [
        mkTx({
          id: 'pix-in',
          accountId: 'acc-b',
          description: 'TRANSFERÊNCIA A CRÉDITO VIA PIX',
          amount: 227.17,
          type: 'CREDIT',
          categoryId: '04000000',
          category: 'Same person transfer',
        }),
      ],
    };
    await pluggySyncService.syncFinance('item-a', { client: mkClient('item-a', [checking('acc-a')], txsA), now });
    await pluggySyncService.syncFinance('item-b', { client: mkClient('item-b', [checking('acc-b')], txsB), now });
    await pluggySyncService.syncFinance('item-a', { client: mkClient('item-a', [checking('acc-a')], txsA), now });

    const byExt = new Map((await finRepository.listAllEntries()).map((e) => [e.external_id, e]));
    expect(byExt.get('pix-out')!.transfer_group_id).toBeTruthy();
    expect(byExt.get('pix-out')!.transfer_group_id).toBe(byExt.get('pix-in')!.transfer_group_id);
    expect(byExt.get('pix-out')!.of_class_reason).toBe('OWN_ACCOUNT_PAIRED');
    expect(byExt.get('pix-in')!.of_class_reason).toBe('OWN_ACCOUNT_PAIRED');
  });
});
