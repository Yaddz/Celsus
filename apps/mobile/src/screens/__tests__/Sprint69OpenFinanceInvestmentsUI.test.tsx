import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { pluggyCredentialsService } from '../../services/pluggy/pluggyClient';
import { pluggyInvestmentsSyncService } from '../../services/pluggy/pluggyInvestmentsSyncService';
import { InMemorySecureStorage, setSecureStorageProvider } from '../../services/secureStorage';
import { FAKE_PLUGGY_CREDENTIALS } from '../../services/pluggy/__tests__/pluggyFixtures';
import { OpenFinanceScreen } from '../OpenFinanceScreen';

jest.mock('../../services/pluggy/pluggyInvestmentsSyncService', () => ({
  pluggyInvestmentsSyncService: {
    previewReconciliation: jest.fn(),
    syncInvestments: jest.fn(),
    disconnectItemInvestments: jest.fn(),
    checkB3ImportConflicts: jest.fn(),
  },
}));

const mocked = pluggyInvestmentsSyncService as unknown as {
  previewReconciliation: jest.Mock;
  syncInvestments: jest.Mock;
  disconnectItemInvestments: jest.Mock;
};

function makeProposal(strategy: 'EXTERNAL_ID' | 'NONE', assetId: string | null) {
  return {
    pluggyInvestment: {
      id: 'pg-inv-1',
      itemId: 'item-inv',
      type: 'FIXED_INCOME',
      subtype: 'CDB',
      code: null,
      name: 'CDB Banco 110% CDI',
      quantity: 1,
      balance: 5200,
      currencyCode: 'BRL',
      status: 'ACTIVE',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-11-16T10:00:00Z',
    },
    suggestedAssetId: assetId,
    matchStrategy: strategy,
    suggestedPortfolioId: null,
  };
}

const SYNC_RESULT = {
  runId: 'run-1',
  itemId: 'item-inv',
  status: 'SUCCESS',
  counts: {
    investmentsFetched: 1,
    assetsCreated: 1,
    assetsUpdated: 0,
    assetsClosed: 0,
    assetsMarkedMissing: 0,
    transactionsArchived: 0,
    transactionsCreated: 2,
  },
  coverageByClass: [],
  needsReconciliation: false,
};

describe('Sprint 69 — Investimentos do Open Finance acessíveis pela tela', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    jest.clearAllMocks();
    await resetDatabase();
    storage = new InMemorySecureStorage();
    setSecureStorageProvider(storage);
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);
    await openFinanceRepository.upsertItem({
      id: 'item-inv',
      connector_name: 'Banco Teste',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: '2027-06-01T00:00:00.000Z',
      last_synced_at: '2026-11-16T10:00:00.000Z',
      last_error: null,
    });
    mocked.syncInvestments.mockResolvedValue(SYNC_RESULT);
    mocked.disconnectItemInvestments.mockResolvedValue({
      revertedAssets: 0,
      restoredTransactions: 0,
    });
  });

  afterEach(() => {
    setSecureStorageProvider(null);
  });

  it('S69-U01: investimento novo abre a conciliação e só sincroniza depois de confirmar', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Principal',
      docket_code: 'CP01',
    });
    mocked.previewReconciliation.mockResolvedValue([makeProposal('NONE', null)]);

    const { getByTestId, getByText } = render(<OpenFinanceScreen themeMode="dark" />);
    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-inv')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-sync-investments-btn'));

    await waitFor(() => {
      expect(mocked.previewReconciliation).toHaveBeenCalledWith('item-inv', expect.anything());
      expect(getByTestId('of-reconciliation-confirm-btn')).toBeTruthy();
    });
    expect(mocked.syncInvestments).not.toHaveBeenCalled();
    expect(getByText(/CDB Banco 110% CDI/)).toBeTruthy();

    fireEvent.press(getByTestId('of-reconciliation-confirm-btn'));

    await waitFor(() => {
      expect(mocked.syncInvestments).toHaveBeenCalledTimes(1);
    });
    expect(mocked.syncInvestments).toHaveBeenCalledWith(
      'item-inv',
      expect.objectContaining({
        reconciliationChoices: expect.arrayContaining([
          expect.objectContaining({
            pluggyInvestmentId: 'pg-inv-1',
            action: 'CREATE_NEW',
            targetPortfolioId: portfolio.id,
          }),
        ]),
      })
    );
    await waitFor(() => {
      expect(getByText(/Investimentos sincronizados/i)).toBeTruthy();
    });
  });

  it('S69-U02: investimento já vinculado sincroniza direto, sem abrir a conciliação', async () => {
    await portfolioRepository.createPortfolio({ name: 'Carteira Principal', docket_code: 'CP01' });
    mocked.previewReconciliation.mockResolvedValue([makeProposal('EXTERNAL_ID', 'asset-1')]);

    const { getByTestId, getByText, queryByTestId } = render(<OpenFinanceScreen themeMode="dark" />);
    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-inv')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-sync-investments-btn'));

    await waitFor(() => {
      expect(mocked.syncInvestments).toHaveBeenCalledWith('item-inv', expect.anything());
      expect(getByText(/Investimentos sincronizados/i)).toBeTruthy();
    });
    expect(queryByTestId('of-reconciliation-confirm-btn')).toBeNull();
  });

  it('S69-U03: sem carteira cadastrada avisa e não sincroniza', async () => {
    mocked.previewReconciliation.mockResolvedValue([makeProposal('NONE', null)]);

    const { getByTestId, getByText } = render(<OpenFinanceScreen themeMode="dark" />);
    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-inv')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-sync-investments-btn'));

    await waitFor(() => {
      expect(getByText(/Crie uma carteira/i)).toBeTruthy();
    });
    expect(mocked.syncInvestments).not.toHaveBeenCalled();
  });

  it('S69-U04: remover a conexão desliga os investimentos dela antes de apagar', async () => {
    const { getByTestId, queryByTestId } = render(<OpenFinanceScreen themeMode="dark" />);
    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-inv')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-remove-item-item-inv'));

    await waitFor(() => {
      expect(mocked.disconnectItemInvestments).toHaveBeenCalledWith('item-inv');
      expect(queryByTestId('open-finance-item-item-inv')).toBeNull();
    });
  });
});
