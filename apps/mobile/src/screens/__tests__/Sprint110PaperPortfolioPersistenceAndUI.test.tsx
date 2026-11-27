import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { transactionRepository } from '../../repositories/transactionRepository';
import { sandboxPortfolioRepository } from '../../repositories/sandboxPortfolioRepository';
import { marketApiService } from '../../services/marketApi';
import { resolveBackAction, type BackState } from '../../navigation/backNavigation';
import { SandboxHubScreen } from '../sandbox/SandboxHubScreen';
import { PaperPortfolioScreen } from '../sandbox/PaperPortfolioScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

describe('Sprint 110 — Carteira fictícia: persistência, conversão e UI (Artboard 3, R50)', () => {
  beforeEach(async () => {
    await resetDatabase();
    jest.restoreAllMocks();
  });

  test('S110-T07: "Copiar minha carteira" reproduz os pesos atuais da carteira ativa', async () => {
    const p = await portfolioRepository.createPortfolio({
      name: 'Carteira Principal',
      docket_code: 'PR-1',
    });
    // PETR4: 10 * 30 = 300 (60%); HGLG11: 2 * 100 = 200 (40%)
    await assetRepository.createAsset({
      portfolio_id: p.id,
      ticker: 'PETR4',
      name: 'Petrobras',
      asset_class: 'STOCK',
      quantity: '10',
      average_price: '30.00',
    });
    await assetRepository.createAsset({
      portfolio_id: p.id,
      ticker: 'HGLG11',
      name: 'CSHG Logística',
      asset_class: 'FII',
      quantity: '2',
      average_price: '100.00',
    });

    const copied = await sandboxPortfolioRepository.copyFromRealPortfolio(p.id);
    expect(copied).toHaveLength(2);
    const petr = copied.find((i) => i.ticker === 'PETR4');
    const hglg = copied.find((i) => i.ticker === 'HGLG11');
    expect(petr?.weight).toBeCloseTo(60, 1);
    expect(hglg?.weight).toBeCloseTo(40, 1);
    const sum = copied.reduce((acc, i) => acc + i.weight, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  test('S110-T08: "Transformar em carteira real" cria carteira e metas, zero transações e não altera patrimônio', async () => {
    const { portfolioId } = await sandboxPortfolioRepository.convertToRealPortfolio({
      name: 'Carteira Fictícia Convertida',
      items: [
        { ticker: 'PETR4', class: 'STOCK', weight: 30 },
        { ticker: 'WEGE3', class: 'STOCK', weight: 30 },
        { ticker: 'HGLG11', class: 'FII', weight: 40 },
      ],
    });

    const created = await portfolioRepository.getPortfolioById(portfolioId);
    expect(created).toBeTruthy();
    expect(created?.name).toBe('Carteira Fictícia Convertida');

    const classTargets = await portfolioRepository.getClassTargets(portfolioId);
    const stockTarget = classTargets.find((c) => c.asset_class === 'STOCK');
    const fiiTarget = classTargets.find((c) => c.asset_class === 'FII');
    expect(stockTarget?.target_percentage).toBeCloseTo(60, 1);
    expect(fiiTarget?.target_percentage).toBeCloseTo(40, 1);

    const createdAssets = await assetRepository.getAssetsByPortfolio(portfolioId);
    expect(createdAssets).toHaveLength(3);
    for (const a of createdAssets) {
      expect(Number(a.quantity)).toBe(0);
    }
    const petr = createdAssets.find((a) => a.ticker === 'PETR4');
    expect(petr?.target_percentage_in_class).toBeCloseTo(50, 1);

    // Zero movimentações criadas
    const txs = await transactionRepository.getAllTransactions();
    expect(txs).toHaveLength(0);

    // Também verifica persistência em sandbox_portfolios / sandbox_portfolio_items
    const saved = await sandboxPortfolioRepository.savePortfolio({
      name: 'Minha Fictícia',
      startDate: '2025-01-02',
      initialCents: 100_000,
      monthlyCents: 50_000,
      rebalance: 6,
      items: [
        { ticker: 'PETR4', class: 'STOCK', weight: 60 },
        { ticker: 'HGLG11', class: 'FII', weight: 40 },
      ],
    });
    const loaded = await sandboxPortfolioRepository.getPortfolioWithItems(saved.id);
    expect(loaded?.items).toHaveLength(2);
    expect(loaded?.rebalance).toBe('6');
  });

  test('S110-T09: PaperPortfolioScreen valida pesos != 100%, distribui restante, exibe gráfico com 3 séries e ativa tile no hub', async () => {
    // Hub tem tile Carteira fictícia ativo (sem selo Em breve) e navega
    const onOpenPaperPortfolio = jest.fn();
    const hub = render(
      wrap(
        <SandboxHubScreen
          onBack={jest.fn()}
          onOpenPaperPortfolio={onOpenPaperPortfolio}
          onOpenTimeMachine={jest.fn()}
          onOpenContributionSimulator={jest.fn()}
        />
      )
    );
    await waitFor(() => {
      expect(hub.getByTestId('sandbox-tile-carteira-ficticia')).toBeTruthy();
    });
    fireEvent.press(hub.getByTestId('sandbox-tile-carteira-ficticia'));
    expect(onOpenPaperPortfolio).toHaveBeenCalledTimes(1);

    // BackState fecha PaperPortfolio antes do SandboxHub
    const backState: BackState = {
      activeTab: 'stats',
      isSettingsOpen: false,
      isTransactionDetailOpen: false,
      isAllTransactionsOpen: false,
      isClassDetailOpen: false,
      isTransactionModalOpen: false,
      isPortfolioManagerOpen: false,
      isSimulatorOpen: false,
      isSandboxHubOpen: true,
      isPaperPortfolioOpen: true,
    };
    expect(resolveBackAction(backState)).toBe('close-paper-portfolio');

    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-02', close: 30 },
      { date: '2025-06-02', close: 36 },
      { date: '2025-11-03', close: 42 },
    ]);
    jest.spyOn(marketApiService, 'fetchMacroRates').mockResolvedValue([
      { date: '2025-01-02', cdi: 10.5 },
      { date: '2025-11-03', cdi: 11.2 },
    ]);

    const screen = render(wrap(<PaperPortfolioScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('paper-portfolio-screen')).toBeTruthy();
      expect(screen.getByText('Carteira fictícia')).toBeTruthy();
      expect(screen.getByText('SANDBOX')).toBeTruthy();
    });

    // Altera peso do primeiro item para 70% (soma != 100%) -> exibe erro de validação
    fireEvent.changeText(screen.getByTestId('pp-weight-input-0'), '70');
    await waitFor(() => {
      expect(screen.getByTestId('pp-weight-error')).toBeTruthy();
    });

    // Botão "Distribuir o restante" ajusta para fechar 100%
    fireEvent.press(screen.getByTestId('pp-distribute-rest-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('pp-weight-error')).toBeNull();
    });

    // Simula e verifica gráfico com 3 séries (Fictícia, Real, CDI) e KPIs
    fireEvent.press(screen.getByTestId('pp-simulate-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('pp-chart-3-series')).toBeTruthy();
      expect(screen.getByTestId('pp-series-ficticia')).toBeTruthy();
      expect(screen.getByTestId('pp-series-real')).toBeTruthy();
      expect(screen.getByTestId('pp-series-cdi')).toBeTruthy();
      expect(screen.getByText('Patrimônio final')).toBeTruthy();
      expect(screen.getByText('Pior queda')).toBeTruthy();
    });

    // Botão "Transformar em carteira real" abre ConfirmDialog
    fireEvent.press(screen.getByTestId('pp-convert-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    });
  });

  test('S110-T10: Modo privacidade mascara todos os valores na PaperPortfolioScreen', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-02', close: 30 },
      { date: '2025-11-03', close: 45 },
    ]);
    jest.spyOn(marketApiService, 'fetchMacroRates').mockResolvedValue([
      { date: '2025-01-02', cdi: 10.5 },
    ]);

    const screen = render(wrap(<PaperPortfolioScreen isPrivacyMode={true} onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('pp-simulate-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('pp-simulate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pp-kpi-final-value')).toBeTruthy();
    });
    expect(screen.getByTestId('pp-kpi-final-value').props.children).toContain('••••');
    expect(screen.getByTestId('pp-kpi-drawdown').props.children).toContain('••••');
  });
});
