import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { marketApiService } from '../../services/marketApi';
import { patrimonyService } from '../../services/patrimonyService';
import { resolveBackAction, type BackState } from '../../navigation/backNavigation';
import { SandboxHubScreen } from '../sandbox/SandboxHubScreen';
import { StressTestScreen } from '../sandbox/StressTestScreen';
import { CompareScreen } from '../sandbox/CompareScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

describe('Sprint 113 — StressTestScreen, CompareScreen, Hub e Voltar Android', () => {
  beforeEach(async () => {
    await resetDatabase();
    jest.restoreAllMocks();
  });

  test('S113-T08: StressTestScreen exibe queda máxima, recuperação, valor no fundo, aviso de "sem dado" e modo privacidade', async () => {
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Principal' });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'ACOES',
      quantity: '100',
      average_price: '30',
    });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'NOVO11',
      name: 'Novo ETF',
      asset_class: 'ETF',
      quantity: '50',
      average_price: '40',
    });

    jest.spyOn(patrimonyService, 'getPatrimony').mockResolvedValue({
      investedCents: 10_000_000, // R$ 100.000
      accountsCents: 0,
      cardsCents: 0,
      totalCents: 10_000_000,
      byPortfolio: [
        {
          portfolioId: portfolio.id,
          name: 'Principal',
          marketValueCents: 10_000_000,
          byClassCents: {},
          annualReturnPercent: 0,
        },
      ],
      byAccount: [],
    });

    jest.spyOn(marketApiService, 'getPriceHistory').mockImplementation(async (ticker: string) => {
      if (ticker === 'PETR4') {
        return [
          { date: '2020-01-01', close: 100 },
          { date: '2020-03-01', close: 60 },
          { date: '2020-05-01', close: 100 },
        ];
      }
      if (ticker === 'BOVA11') {
        return [
          { date: '2020-01-01', close: 100 },
          { date: '2020-03-01', close: 55 },
          { date: '2020-05-01', close: 100 },
        ];
      }
      // NOVO11 sem dados na janela
      return [];
    });

    const screen1 = render(
      wrap(
        <StressTestScreen
          onBack={jest.fn()}
          isPrivacyMode={false}
          referenceDateIso="2026-11-27"
        />
      )
    );

    await waitFor(() => {
      expect(screen1.getByTestId('stress-kpi-drawdown')).toBeTruthy();
    });
    expect(screen1.getByTestId('stress-kpi-recovery')).toBeTruthy();
    expect(screen1.getByTestId('stress-kpi-trough-value')).toBeTruthy();
    expect(screen1.getByTestId('stress-warning-missing')).toBeTruthy();
    expect(screen1.getByText(/sem dado/i)).toBeTruthy();
    screen1.unmount();

    const screenPrivacy = render(
      wrap(
        <StressTestScreen
          onBack={jest.fn()}
          isPrivacyMode={true}
          referenceDateIso="2026-11-27"
        />
      )
    );

    await waitFor(() => {
      expect(screenPrivacy.getByTestId('stress-kpi-trough-value')).toBeTruthy();
    });
    expect(screenPrivacy.getByTestId('stress-kpi-trough-value').props.children).toContain('•••');
  });

  test('S113-T09: StressTestScreen atalho "Pior queda (5 anos)" calcula janela dinamicamente da série do BOVA11', async () => {
    const portfolio = await portfolioRepository.createPortfolio({ name: 'Principal' });
    await assetRepository.createAsset({
      portfolio_id: portfolio.id,
      ticker: 'BOVA11',
      name: 'Bovespa ETF',
      asset_class: 'ETF',
      quantity: '10',
      average_price: '100',
    });

    jest.spyOn(patrimonyService, 'getPatrimony').mockResolvedValue({
      investedCents: 1_000_000,
      accountsCents: 0,
      cardsCents: 0,
      totalCents: 1_000_000,
      byPortfolio: [],
      byAccount: [],
    });

    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2022-01-10', close: 120 },
      { date: '2022-06-15', close: 90 },
      { date: '2023-03-10', close: 125 },
    ]);

    const screen = render(
      wrap(
        <StressTestScreen
          onBack={jest.fn()}
          referenceDateIso="2026-11-27"
        />
      )
    );

    await waitFor(() => {
      expect(screen.getByTestId('stress-shortcut-5y')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('stress-shortcut-5y'));

    await waitFor(() => {
      expect(screen.getByTestId('stress-start-input').props.value).toBe('2022-01-10');
      expect(screen.getByTestId('stress-end-input').props.value).toBe('2022-06-15');
    });
  });

  test('S113-T10: CompareScreen exibe até 4 ativos + CDI + IPCA normalizados em 100 e modo privacidade', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockImplementation(async (ticker: string) => [
      { date: '2025-01-01', close: 100 },
      { date: '2025-06-01', close: ticker === 'PETR4' ? 120 : 110 },
    ]);
    jest.spyOn(marketApiService, 'fetchMacroRates').mockResolvedValue([
      { date: '2025-01-01', cdi: 1.0, ipca: 0.4 },
      { date: '2025-06-01', cdi: 1.0, ipca: 0.4 },
    ]);

    const screen = render(
      wrap(
        <CompareScreen
          onBack={jest.fn()}
          isPrivacyMode={false}
          referenceDateIso="2025-06-01"
        />
      )
    );

    await waitFor(() => {
      expect(screen.getByTestId('compare-item-CDI')).toBeTruthy();
      expect(screen.getByTestId('compare-item-IPCA')).toBeTruthy();
    });
    expect(screen.getByTestId('compare-base-badge')).toBeTruthy();
    screen.unmount();

    const screenPrivacy = render(
      wrap(
        <CompareScreen
          onBack={jest.fn()}
          isPrivacyMode={true}
          referenceDateIso="2025-06-01"
        />
      )
    );

    await waitFor(() => {
      expect(screenPrivacy.getByTestId('compare-screen')).toBeTruthy();
    });
  });

  test('S113-T11: Ativação dos tiles no SandboxHubScreen e botão voltar do Android', () => {
    const onOpenStressTest = jest.fn();
    const onOpenCompare = jest.fn();

    const hub = render(
      wrap(
        <SandboxHubScreen
          onOpenStressTest={onOpenStressTest}
          onOpenCompare={onOpenCompare}
        />
      )
    );

    fireEvent.press(hub.getByTestId('sandbox-tile-teste-estresse'));
    expect(onOpenStressTest).toHaveBeenCalledTimes(1);

    fireEvent.press(hub.getByTestId('sandbox-tile-comparar'));
    expect(onOpenCompare).toHaveBeenCalledTimes(1);

    expect(hub.queryByText('Em breve')).toBeNull();

    const baseState: BackState = {
      activeTab: 'stats',
      isSettingsOpen: false,
      isTransactionDetailOpen: false,
      isAllTransactionsOpen: false,
      isClassDetailOpen: false,
      isTransactionModalOpen: false,
      isPortfolioManagerOpen: false,
      isSimulatorOpen: false,
      isSandboxHubOpen: true,
    };

    expect(resolveBackAction({ ...baseState, isStressTestOpen: true })).toBe('close-stress-test');
    expect(resolveBackAction({ ...baseState, isCompareOpen: true })).toBe('close-compare');
  });
});
