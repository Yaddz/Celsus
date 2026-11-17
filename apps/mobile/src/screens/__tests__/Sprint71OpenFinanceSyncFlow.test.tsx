import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { PluggyClient } from '../../services/pluggy/pluggyClient';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
import { InMemorySecureStorage, setSecureStorageProvider } from '../../services/secureStorage';
import { OpenFinanceScreen } from '../OpenFinanceScreen';
import type { PluggyAccount } from '../../services/pluggy/types';

function makeFakeAccount(id: string, itemId: string, name: string): PluggyAccount {
  return {
    id,
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    number: id === 'acc-1' ? '001122-3' : '004455-6',
    name,
    balance: 1000,
    itemId,
    currencyCode: 'BRL',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
  };
}

describe('Sprint 71 — Fluxo OpenFinanceScreen e Diagnóstico (Fase A)', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    await resetDatabase();
    storage = new InMemorySecureStorage();
    setSecureStorageProvider(storage);
    await storage.setItem('pluggy.client_id', 'cid');
    await storage.setItem('pluggy.client_secret', 'csec');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setSecureStorageProvider(null);
  });

  it('S71-T23: um único toque em Sincronizar finanças percorre TODOS os itens não conciliados em sequência', async () => {
    await openFinanceRepository.addItem('item-1');
    await openFinanceRepository.addItem('item-2');

    const previewSpy = jest
      .spyOn(pluggySyncService, 'previewAccountReconciliation')
      .mockImplementation(async (itemId: string) => [
        {
          pluggyAccount: makeFakeAccount(
            itemId === 'item-1' ? 'acc-1' : 'acc-2',
            itemId,
            itemId === 'item-1' ? 'Conta Itaú' : 'Conta Nubank'
          ),
          suggestedLocalAccountId: null,
        },
      ]);

    const syncSpy = jest
      .spyOn(pluggySyncService, 'syncFinance')
      .mockImplementation(async (itemId: string) => {
        await openFinanceRepository.upsertItem({
          id: itemId,
          connector_name: itemId === 'item-1' ? 'Itaú' : 'Nubank',
          status: 'UPDATED',
          execution_status: 'SUCCESS',
          consent_expires_at: null,
          last_synced_at: '2026-11-16T12:00:00Z',
          last_error: null,
        });
        return {
          runId: `run-${itemId}`,
          itemId,
          status: 'SUCCESS',
          counts: {
            accountsSynced: 1,
            transactionsFetched: 2,
            transactionsCreated: 2,
            transactionsUpdated: 0,
            transactionsSettled: 0,
            transfersMatched: 0,
            billsSynced: 0,
          },
          accountsNeedingClosingDay: [],
        };
      });

    const { getByTestId, queryByText, getByText } = await render(<OpenFinanceScreen themeMode="dark" />);

    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-1')).toBeTruthy();
      expect(getByTestId('open-finance-item-item-2')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-advanced-toggle'));
    fireEvent.press(getByTestId('open-finance-sync-finance-btn'));

    // Primeiro item abre conciliação
    await waitFor(() => {
      expect(getByTestId('open-finance-reconcile-card')).toBeTruthy();
      expect(getByText(/Conta Itaú/)).toBeTruthy();
    });

    // Confirma o 1º item -> deve abrir automaticamente o 2º item sem novo toque em Sincronizar
    fireEvent.press(getByTestId('open-finance-confirm-reconcile-btn'));

    await waitFor(() => {
      expect(getByText(/Conta Nubank/)).toBeTruthy();
    });

    // Confirma o 2º item -> conclui
    fireEvent.press(getByTestId('open-finance-confirm-reconcile-btn'));

    await waitFor(() => {
      expect(queryByText(/Conta Nubank/)).toBeNull();
    });

    expect(previewSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy).toHaveBeenCalledTimes(2);
  });

  it('S71-T24: exibe o tile Diagnóstico da última sincronização (open-finance-diagnostics) após sincronizar', async () => {
    await openFinanceRepository.addItem('item-1');
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/auth')) {
        return new Response(JSON.stringify({ apiKey: 'k' }), { status: 200 });
      }
      if (url.includes('/items/')) {
        return new Response(
          JSON.stringify({
            id: 'item-1',
            connector: { id: 1, name: 'Itaú' },
            status: 'UPDATED',
            executionStatus: 'SUCCESS',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-11-16T00:00:00Z',
          }),
          { status: 200 }
        );
      }
      if (url.includes('/accounts')) {
        return new Response(
          JSON.stringify({
            page: 1,
            total: 1,
            totalPages: 1,
            results: [makeFakeAccount('acc-1', 'item-1', 'Conta Itaú')],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ page: 1, total: 0, totalPages: 1, results: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = new PluggyClient({ fetchImpl, storage, maxRetries: 0, baseDelayMs: 0 });
    const { getByTestId, getByText } = await render(
      <OpenFinanceScreen themeMode="dark" client={client} />
    );

    await waitFor(() => expect(getByTestId('open-finance-test-connection-btn')).toBeTruthy());
    fireEvent.press(getByTestId('open-finance-test-connection-btn'));

    await waitFor(() => {
      expect(getByTestId('open-finance-diagnostics')).toBeTruthy();
      expect(getByText(/Diagnóstico da última sincronização/i)).toBeTruthy();
    });
  });

  it('S71-T25: botão Copiar relatório copia texto sem dados pessoais', async () => {
    await openFinanceRepository.addItem('item-1');
    const copiedTexts: string[] = [];
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/auth')) {
        return new Response(JSON.stringify({ apiKey: 'k' }), { status: 200 });
      }
      if (url.includes('/items/')) {
        return new Response(
          JSON.stringify({
            id: 'item-1',
            connector: { id: 1, name: 'Itaú' },
            status: 'UPDATED',
            executionStatus: 'SUCCESS',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-11-16T00:00:00Z',
          }),
          { status: 200 }
        );
      }
      if (url.includes('/accounts')) {
        return new Response(
          JSON.stringify({
            page: 1,
            total: 1,
            totalPages: 1,
            results: [
              {
                ...makeFakeAccount('acc-1', 'item-1', 'Conta Itaú'),
                owner: 'JOAO DA SILVA',
                taxNumber: '111.222.333-44',
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ page: 1, total: 0, totalPages: 1, results: [] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const client = new PluggyClient({ fetchImpl, storage, maxRetries: 0, baseDelayMs: 0 });
    const onCopyReport = jest.fn((text: string) => {
      copiedTexts.push(text);
    });

    const { getByTestId } = await render(
      <OpenFinanceScreen themeMode="light" client={client} onCopyReport={onCopyReport} />
    );

    await waitFor(() => expect(getByTestId('open-finance-test-connection-btn')).toBeTruthy());
    fireEvent.press(getByTestId('open-finance-test-connection-btn'));

    await waitFor(() => expect(getByTestId('open-finance-copy-diagnostics-btn')).toBeTruthy());
    fireEvent.press(getByTestId('open-finance-copy-diagnostics-btn'));

    expect(onCopyReport).toHaveBeenCalledTimes(1);
    expect(copiedTexts[0]).not.toContain('JOAO DA SILVA');
    expect(copiedTexts[0]).not.toContain('111.222.333-44');
    expect(copiedTexts[0]).not.toContain('001122-3');
  });
});
