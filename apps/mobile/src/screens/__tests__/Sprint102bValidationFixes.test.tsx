import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { getDatabase, resetDatabase } from '../../db/client';
import { finRepository, SQLITE_MAX_VARIABLES } from '../../repositories/finRepository';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { OpenFinanceReconciliationScreen } from '../OpenFinanceReconciliationScreen';

/**
 * Correções da validação no aparelho depois da Sprint 102 (17/11/2026):
 * - a tela "Conferir com o Meu Pluggy" ficava piscando (efeito de carga rodando a cada render);
 * - a sincronização Open Finance quebrava no SQLite com muitos lançamentos novos num único INSERT.
 */
describe('Sprint 102b — correções da validação no aparelho', () => {
  beforeEach(() => {
    resetDatabase();
  });

  function buildClient() {
    return {
      getItem: jest.fn(async (id: string) => ({
        id,
        status: 'UPDATED',
        executionStatus: 'SUCCESS',
        connector: { id: 200, name: 'MeuPluggy' },
        lastUpdatedAt: '2026-11-17T09:12:00.000Z',
        consentExpiresAt: null,
      })),
      listAccounts: jest.fn(async () => []),
      listTransactions: jest.fn(async () => []),
      listBills: jest.fn(async () => []),
      listInvestments: jest.fn(async () => []),
    };
  }

  it('S102b-T01: conferência carrega uma vez, mesmo com re-renders e `now` padrão (sem loop de carregamento)', async () => {
    await openFinanceRepository.addItem('item-a');
    const client = buildClient();

    const view = await render(<OpenFinanceReconciliationScreen client={client as any} onClose={() => {}} />);
    await waitFor(() => expect(client.getItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('of-reconciliation-screen')).toBeTruthy());

    // Re-render com novas props equivalentes (o pai re-renderiza com frequência)
    for (let i = 0; i < 3; i += 1) {
      await view.rerender(<OpenFinanceReconciliationScreen client={client as any} onClose={() => {}} />);
    }
    // `now` passado como função nova a cada render também não pode disparar nova carga
    await view.rerender(
      <OpenFinanceReconciliationScreen
        client={client as any}
        onClose={() => {}}
        now={() => new Date('2026-11-17T12:00:00Z')}
      />
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(client.getItem).toHaveBeenCalledTimes(1);
    expect(client.listAccounts).toHaveBeenCalledTimes(1);
  });

  it('S102b-T02: createEntriesBatch grava em lotes abaixo do limite de variáveis do SQLite', async () => {
    const db = getDatabase() as any;
    const insertSpy = jest.spyOn(db, 'insert');
    const total = 1500;
    const items = Array.from({ length: total }, (_, i) => ({
      kind: 'expense',
      amount_cents: 100 + i,
      due_date: '2026-11-01',
      account_id: 'acc-1',
      category_id: 'cat-outros-despesa',
      description: `Lançamento ${i}`,
      source: 'OPEN_FINANCE',
      external_id: `tx-${i}`,
    }));

    const created = await finRepository.createEntriesBatch(items);
    expect(created).toHaveLength(total);

    const columnsPerRow = Object.keys(created[0]).length;
    const maxRowsPerInsert = Math.floor(SQLITE_MAX_VARIABLES / columnsPerRow);
    expect(SQLITE_MAX_VARIABLES).toBeLessThanOrEqual(32766);
    expect(insertSpy.mock.calls.length).toBe(Math.ceil(total / maxRowsPerInsert));
    expect(insertSpy.mock.calls.length).toBeGreaterThan(1);

    const all = await finRepository.listAllEntries();
    expect(all.filter((e) => e.account_id === 'acc-1')).toHaveLength(total);
    insertSpy.mockRestore();
  });
});
