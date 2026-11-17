import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { pluggySyncService } from '../../services/pluggy/pluggySyncService';
import { pluggyInvestmentsSyncService } from '../../services/pluggy/pluggyInvestmentsSyncService';
import { InMemorySecureStorage, setSecureStorageProvider } from '../../services/secureStorage';
import { walletsStore } from '../../stores/walletsStore';
import { OpenFinanceScreen } from '../OpenFinanceScreen';

describe('Sprint 73 — Botão Único Sincronizar na OpenFinanceScreen (Fase A)', () => {
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

  it('S73-T09: exibe botão único Sincronizar (open-finance-sync-btn) e mantém opções avançadas recolhidas', async () => {
    const { getByTestId, queryByTestId } = await render(<OpenFinanceScreen themeMode="dark" />);

    await waitFor(() => {
      expect(getByTestId('open-finance-sync-btn')).toBeTruthy();
    });
    expect(queryByTestId('open-finance-sync-finance-btn')).toBeNull();
    expect(queryByTestId('open-finance-sync-investments-btn')).toBeNull();

    fireEvent.press(getByTestId('open-finance-advanced-toggle'));
    await waitFor(() => {
      expect(getByTestId('open-finance-sync-finance-btn')).toBeTruthy();
      expect(getByTestId('open-finance-sync-investments-btn')).toBeTruthy();
    });
  });

  it('S73-T10: um toque em Sincronizar roda finanças e investimentos de todas as conexões, isola erro parcial e recarrega walletsStore', async () => {
    await openFinanceRepository.upsertItem({
      id: 'item-1',
      connector_name: 'XP',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: null,
      last_synced_at: '2026-11-10T00:00:00Z',
      last_error: null,
    });
    await openFinanceRepository.upsertItem({
      id: 'item-2',
      connector_name: 'BTG',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: null,
      last_synced_at: '2026-11-10T00:00:00Z',
      last_error: null,
    });

    const refreshSpy = jest.spyOn(walletsStore, 'requestRefresh').mockResolvedValue();

    jest.spyOn(pluggySyncService, 'syncFinance').mockImplementation(async (itemId: string) => {
      if (itemId === 'item-2') {
        throw new Error('Falha na rede BTG');
      }
      return {
        runId: `fin-${itemId}`,
        itemId,
        status: 'SUCCESS',
        counts: {
          accountsSynced: 1,
          transactionsFetched: 3,
          transactionsCreated: 3,
          transactionsUpdated: 0,
          transactionsSettled: 0,
          transfersMatched: 0,
          billsSynced: 0,
        },
        accountsNeedingClosingDay: [],
      };
    });

    jest.spyOn(pluggyInvestmentsSyncService, 'syncInvestments').mockImplementation(async (itemId: string) => {
      if (itemId === 'item-1') {
        await portfolioRepository.createPortfolio({ name: 'XP', docket_code: 'REV-CART-001' });
      }
      return {
        runId: `inv-${itemId}`,
        itemId,
        status: 'SUCCESS',
        counts: {
          investmentsFetched: 2,
          assetsCreated: 2,
          assetsUpdated: 0,
          assetsClosed: 0,
          assetsMarkedMissing: 0,
          transactionsArchived: 0,
          transactionsCreated: 2,
          incomesCreated: 1,
          incomesMatched: 0,
          incomesSkipped: 0,
        },
        coverageByClass: [],
        needsReconciliation: false,
      };
    });

    const { getByTestId, getByText } = await render(<OpenFinanceScreen themeMode="dark" />);
    await waitFor(() => expect(getByTestId('open-finance-item-item-1')).toBeTruthy());

    fireEvent.press(getByTestId('open-finance-sync-btn'));

    await waitFor(() => {
      expect(getByText(/Falha na rede BTG/i)).toBeTruthy();
      expect(getByText(/XP/i)).toBeTruthy();
    });

    expect(refreshSpy).toHaveBeenCalled();
  });
});
