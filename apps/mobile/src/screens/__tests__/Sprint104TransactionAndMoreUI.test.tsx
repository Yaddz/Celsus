import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { finRepository } from '../../repositories/finRepository';
import { appMetaRepository } from '../../repositories/appMetaRepository';
import { transactionService } from '../../services/transactionService';
import { TransactionScreen } from '../TransactionScreen';
import { EntriesListScreen } from '../finance/EntriesListScreen';
import { FinanceMoreScreen } from '../finance/FinanceMoreScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

describe('Sprint 104 — UI: TransactionScreen, EntriesListScreen e FinanceMoreScreen', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finRepository.seedDefaultCategoriesIfNeeded();
  });

  test('S104-T13: TransactionScreen com carteira vinculada exibe toggle ligado, chips "Sai de" e saldo projetado "Saldo … → …"', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 100000, // R$ 1.000,00
    });
    const checking = await finRepository.createAccount({
      name: 'Nubank',
      type: 'checking',
      initialBalanceCents: 250000, // R$ 2.500,00
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const { getByText, getByTestId } = render(
      wrap(
        <TransactionScreen
          initialPortfolioId={portfolio.id}
          initialAssetId={asset.id}
          isNativeBridgeAvailable={false}
        />
      )
    );

    await waitFor(() => {
      expect(getByText('Pagar com saldo de uma conta')).toBeTruthy();
      expect(getByText('Sai de')).toBeTruthy();
      expect(getByTestId(`cash-source-chip-${broker.id}`)).toBeTruthy();
      expect(getByTestId(`cash-source-chip-${checking.id}`)).toBeTruthy();
    });

    // Preenche preço 30 e quantidade 10 => total R$ 300,00
    fireEvent.changeText(getByTestId('transaction-unit-price-input'), '30');
    fireEvent.changeText(getByTestId('transaction-quantity-input'), '10');

    // Saldo corretora: R$ 1.000,00 → R$ 700,00
    await waitFor(() => {
      expect(getByTestId('cash-projected-balance').props.children).toBeTruthy();
      const text = Array.isArray(getByTestId('cash-projected-balance').props.children)
        ? getByTestId('cash-projected-balance').props.children.join('')
        : String(getByTestId('cash-projected-balance').props.children);
      expect(text).toContain('1.000,00');
      expect(text).toContain('700,00');
      expect(text).toContain('→');
    });
  });

  test('S104-T14: TransactionScreen sem vínculo exibe aviso "Vincular uma conta?" apenas uma vez por carteira (app_meta)', async () => {
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira Sem Vínculo',
      docket_code: 'SV-1',
    });
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'VALE3',
      name: 'Vale',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    const first = render(
      wrap(
        <TransactionScreen
          initialPortfolioId={portfolio.id}
          initialAssetId={asset.id}
          isNativeBridgeAvailable={false}
        />
      )
    );

    await waitFor(() => {
      expect(first.getByText(/Vincular uma conta\?/i)).toBeTruthy();
    });
    expect(await appMetaRepository.get(`link-prompt:${portfolio.id}`)).toBe('1');
    first.unmount();

    // Segunda abertura na mesma carteira NÃO mostra mais o aviso
    const second = render(
      wrap(
        <TransactionScreen
          initialPortfolioId={portfolio.id}
          initialAssetId={asset.id}
          isNativeBridgeAvailable={false}
        />
      )
    );

    await waitFor(() => {
      expect(second.getByTestId('transaction-save-submit-btn')).toBeTruthy();
    });
    expect(second.queryByText(/Vincular uma conta\?/i)).toBeNull();
  });

  test('S104-T15: EntriesListScreen bloqueia exclusão de lançamento investment_* com ConfirmDialog informando a carteira', async () => {
    const broker = await finRepository.createAccount({
      name: 'Corretora XP',
      type: 'broker',
      initialBalanceCents: 100000,
    });
    const portfolio = await portfolioRepository.createPortfolio({
      name: 'Carteira XP',
      docket_code: 'XP-1',
    });
    await portfolioRepository.linkFinAccount(portfolio.id, broker.id);
    const asset = await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '0',
      average_price: '0.00',
    });

    await transactionService.executeTransaction({
      portfolioId: portfolio.id,
      assetId: asset.id,
      type: 'BUY',
      tradeDate: '2026-11-15',
      quantity: '10',
      unitPrice: '30.00',
    });

    const entries = await finRepository.listEntriesByMonth('2026-11');
    expect(entries).toHaveLength(1);

    const { getByTestId, getByText } = render(
      wrap(
        <EntriesListScreen
          onBack={() => {}}
          initialMonth="2026-11"
        />
      )
    );

    await waitFor(() => {
      expect(getByTestId(`entry-row-${entries[0].id}`)).toBeTruthy();
    });

    fireEvent.press(getByTestId(`entry-row-${entries[0].id}`));
    await waitFor(() => {
      expect(getByText('Excluir')).toBeTruthy();
    });
    fireEvent.press(getByText('Excluir'));

    await waitFor(() => {
      expect(
        getByText('Esse lançamento vem da carteira Carteira XP. Exclua a movimentação por lá.')
      ).toBeTruthy();
    });

    // Continua existindo
    expect(await finRepository.listEntriesByMonth('2026-11')).toHaveLength(1);
  });

  test('S104-T16: FinanceMoreScreen oferece "Reclassificar despesas antigas que parecem aporte"', () => {
    const onOpen = jest.fn();
    const { getByTestId, getByText } = render(
      wrap(
        <FinanceMoreScreen
          onBack={() => {}}
          onOpen={onOpen}
        />
      )
    );

    expect(getByTestId('finance-more-reclassify-aportes')).toBeTruthy();
    expect(getByText(/Reclassificar.*aporte/i)).toBeTruthy();
    fireEvent.press(getByTestId('finance-more-reclassify-aportes'));
    expect(onOpen).toHaveBeenCalledWith('reclassifyAportes');
  });
});
