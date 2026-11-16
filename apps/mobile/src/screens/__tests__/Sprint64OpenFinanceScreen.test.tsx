import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { resolveBackAction } from '../../navigation/backNavigation';
import { openFinanceRepository } from '../../repositories/openFinanceRepository';
import { pluggyCredentialsService } from '../../services/pluggy/pluggyClient';
import { InMemorySecureStorage, setSecureStorageProvider } from '../../services/secureStorage';
import { OpenFinanceScreen } from '../OpenFinanceScreen';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import {
  FAKE_PLUGGY_CREDENTIALS,
  makePluggyAccounts,
  makePluggyBills,
  makePluggyInvestments,
  makePluggyItem,
} from '../../services/pluggy/__tests__/pluggyFixtures';

describe('Sprint 64 — Tela Open Finance (Fase A)', () => {
  let storage: InMemorySecureStorage;

  beforeEach(async () => {
    await resetDatabase();
    storage = new InMemorySecureStorage();
    setSecureStorageProvider(storage);
  });

  afterEach(() => {
    setSecureStorageProvider(null);
  });

  it('S64-T11: exibe passo a passo de 4 etapas com links e campos mascarados para Client ID e Client Secret', async () => {
    const { getByTestId, getByText } = await render(<OpenFinanceScreen themeMode="light" />);

    await waitFor(() => {
      expect(getByTestId('open-finance-guide')).toBeTruthy();
    });

    expect(getByText(/meu\.pluggy\.ai/i)).toBeTruthy();
    expect(getByText(/dashboard\.pluggy\.ai/i)).toBeTruthy();
    expect(getByText(/MeuPluggy/i)).toBeTruthy();

    const clientIdInput = getByTestId('open-finance-client-id-input');
    const clientSecretInput = getByTestId('open-finance-client-secret-input');
    expect(clientIdInput.props.secureTextEntry).toBe(true);
    expect(clientSecretInput.props.secureTextEntry).toBe(true);
    expect(getByTestId('open-finance-test-connection-btn')).toBeTruthy();
  });

  it('S64-T12: lista itens com banco, status, última atualização, aviso de vencimento em 30 dias e instrução de renovação quando expirado', async () => {
    const now = Date.now();
    const in15Days = new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString();
    const expired10DaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();

    await openFinanceRepository.upsertItem({
      id: 'item-warning',
      connector_name: 'Itaú',
      status: 'UPDATED',
      execution_status: 'SUCCESS',
      consent_expires_at: in15Days,
      last_synced_at: '2026-11-16T10:00:00.000Z',
      last_error: null,
    });

    await openFinanceRepository.upsertItem({
      id: 'item-expired',
      connector_name: 'Nubank',
      status: 'LOGIN_ERROR',
      execution_status: 'USER_AUTHORIZATION_EXPIRED',
      consent_expires_at: expired10DaysAgo,
      last_synced_at: '2026-10-01T10:00:00.000Z',
      last_error: 'Autorização expirada',
    });

    const { getByTestId, getByText } = await render(<OpenFinanceScreen themeMode="dark" />);

    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-warning')).toBeTruthy();
      expect(getByTestId('open-finance-item-item-expired')).toBeTruthy();
    });

    expect(getByText('Itaú')).toBeTruthy();
    expect(getByText(/autorização vence em \d+ dias/i)).toBeTruthy();
    expect(getByTestId('open-finance-item-warning-badge-item-warning')).toBeTruthy();

    expect(getByText('Nubank')).toBeTruthy();
    expect(getByTestId('open-finance-item-expired-error-item-expired')).toBeTruthy();
    expect(getByText(/renovar|Connect Account/i)).toBeTruthy();
  });

  it('S64-T13: bloqueia adição do 6º item com mensagem explicando o limite do Meu Pluggy', async () => {
    for (let i = 1; i <= 5; i += 1) {
      await openFinanceRepository.addItem(`item-${i}`);
    }

    const { getByTestId, getByText } = await render(<OpenFinanceScreen themeMode="light" />);

    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-5')).toBeTruthy();
    });

    fireEvent.changeText(getByTestId('open-finance-new-item-input'), 'item-6');
    fireEvent.press(getByTestId('open-finance-add-item-btn'));

    await waitFor(() => {
      expect(getByText(/limite.*5|máximo 5/i)).toBeTruthy();
    });
  });

  it('S64-T14: Testar conexão exibe relatório de cobertura por item com contas, cartões, faturas e tipos/subtipos de investimento', async () => {
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);
    await openFinanceRepository.addItem('item-itau-001');

    const mockClient = {
      inspectItemCoverage: jest.fn(async () => ({
        itemId: 'item-itau-001',
        connectorName: 'Itaú',
        status: 'UPDATED',
        executionStatus: 'SUCCESS',
        consentExpiresAt: makePluggyItem().consentExpiresAt ?? null,
        bankAccountsCount: makePluggyAccounts().filter((a) => a.type === 'BANK').length,
        creditCardsCount: makePluggyAccounts().filter((a) => a.type === 'CREDIT').length,
        billsCount: makePluggyBills().length,
        investmentsCount: makePluggyInvestments().length,
        investmentKinds: [
          { type: 'FIXED_INCOME' as const, subtype: 'CDB', count: 1 },
          { type: 'EQUITY' as const, subtype: 'STOCK', count: 1 },
          { type: 'EQUITY' as const, subtype: 'REAL_ESTATE_FUND', count: 1 },
        ],
        hasB3VariableIncome: true,
      })),
    };

    const { getByTestId, getByText } = await render(
      <OpenFinanceScreen themeMode="light" client={mockClient as any} />
    );

    await waitFor(() => {
      expect(getByTestId('open-finance-item-item-itau-001')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-test-connection-btn'));

    await waitFor(() => {
      expect(getByTestId('open-finance-coverage-report')).toBeTruthy();
    });

    expect(getByText(/EQUITY.*STOCK/i)).toBeTruthy();
    expect(getByText(/REAL_ESTATE_FUND/i)).toBeTruthy();
    expect(getByText(/FIXED_INCOME.*CDB/i)).toBeTruthy();
  });

  it('S64-T15: Remover credenciais exige confirmação antes de apagar do SecureStore', async () => {
    await pluggyCredentialsService.saveCredentials(FAKE_PLUGGY_CREDENTIALS, storage);

    const { getByTestId } = await render(<OpenFinanceScreen themeMode="dark" />);

    await waitFor(() => {
      expect(getByTestId('open-finance-remove-credentials-btn')).toBeTruthy();
    });

    fireEvent.press(getByTestId('open-finance-remove-credentials-btn'));

    await waitFor(() => {
      expect(getByTestId('confirm-dialog')).toBeTruthy();
    });

    // Antes de confirmar, credenciais ainda existem
    expect(await pluggyCredentialsService.hasCredentials(storage)).toBe(true);

    fireEvent.press(getByTestId('open-finance-confirm-remove-btn'));

    await waitFor(async () => {
      expect(await pluggyCredentialsService.hasCredentials(storage)).toBe(false);
    });
  });

  it('S64-T16: SettingsBackupScreen expõe entrada para Open Finance e backNavigation fecha a tela', async () => {
    const onOpenOpenFinance = jest.fn();
    const { getByTestId } = await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
        onOpenOpenFinance={onOpenOpenFinance}
      />
    );

    fireEvent.press(getByTestId('open-finance-entry-btn'));
    expect(onOpenOpenFinance).toHaveBeenCalledTimes(1);

    expect(
      resolveBackAction({
        activeTab: 'home',
        isSettingsOpen: true,
        isOpenFinanceOpen: true,
        isTransactionDetailOpen: false,
        isAllTransactionsOpen: false,
        isClassDetailOpen: false,
        isTransactionModalOpen: false,
        isPortfolioManagerOpen: false,
        isSimulatorOpen: false,
      })
    ).toBe('close-open-finance');
  });
});
