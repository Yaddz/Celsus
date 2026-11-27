import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { incomeRepository } from '../../repositories/incomeRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';
import { sandboxRepository } from '../../repositories/sandboxRepository';
import { marketApiService } from '../../services/marketApi';
import { dividendGoalService } from '../../services/dividendGoalService';
import { resolveBackAction, type BackState } from '../../navigation/backNavigation';
import { SandboxHubScreen } from '../sandbox/SandboxHubScreen';
import { DividendGoalScreen, R51_DISCLAIMER_TEXT } from '../sandbox/DividendGoalScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

function build12mDividends(amount: number) {
  const list = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(2026, 10 - i, 15));
    list.push({
      date: d.toISOString().slice(0, 10),
      type: 'RENDIMENTO',
      amount,
      currency: 'BRL',
    });
  }
  return list;
}

describe('Sprint 111 — Meta de dividendos: serviço, hub e UI (Artboard 4, R51)', () => {
  beforeEach(async () => {
    await resetDatabase();
    dividendGoalService.clearCache();
    jest.restoreAllMocks();
  });

  test('S111-T10: exibe chip "= meus gastos fixos (R$ X)" com soma das recorrências ativas (ou "—"), texto fixo R51, filtros e calendário', async () => {
    // 1) Sem recorrências -> chip mostra "—"
    const emptyScreen = render(wrap(<DividendGoalScreen onBack={jest.fn()} />));
    await waitFor(() => {
      expect(emptyScreen.getByTestId('dg-fixed-expenses-chip')).toBeTruthy();
    });
    expect(emptyScreen.getByTestId('dg-fixed-expenses-chip-text').props.children).toContain('—');
    expect(emptyScreen.getByText(R51_DISCLAIMER_TEXT)).toBeTruthy();
    emptyScreen.unmount();

    // 2) Com recorrências ativas de despesa: 2.000 + 1.000 = 3.000 (receita e inativa não entram)
    await finRepository.createAccount({
      name: 'Conta Corrente',
      type: 'checking',
      initial_balance_cents: 100_000,
    });
    const accounts = await finRepository.listAccounts();
    const accId = accounts[0].id;
    await finRepository.createCategory({ name: 'Moradia', kind: 'expense' });
    const cats = await finRepository.listCategories('expense');
    const catId = cats[0].id;

    await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 200_000,
      description: 'Aluguel',
      account_id: accId,
      category_id: catId,
      frequency: 'monthly',
      day_of_month: 5,
      start_date: '2026-01-05',
      active: 1,
    });
    await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 100_000,
      description: 'Condomínio',
      account_id: accId,
      category_id: catId,
      frequency: 'monthly',
      day_of_month: 10,
      start_date: '2026-01-10',
      active: 1,
    });
    await finRepository.createRecurrence({
      kind: 'expense',
      amount_cents: 50_000,
      description: 'Inativa',
      account_id: accId,
      category_id: catId,
      frequency: 'monthly',
      day_of_month: 15,
      start_date: '2026-01-15',
      active: 0,
    });
    await finRepository.createRecurrence({
      kind: 'income',
      amount_cents: 900_000,
      description: 'Salário',
      account_id: accId,
      category_id: catId,
      frequency: 'monthly',
      day_of_month: 1,
      start_date: '2026-01-01',
      active: 1,
    });

    // Mock ranking + dividends + macro IPCA
    jest.spyOn(marketApiService, 'getRanking').mockResolvedValue([
      { ticker: 'MXRF11', name: 'Maxi Renda', assetClass: 'FII', price: 10, dy12m: 12, pvp: 1, change24h: 0 },
      { ticker: 'HGLG11', name: 'CSHG Log', assetClass: 'FII', price: 150, dy12m: 9, pvp: 1, change24h: 0 },
      { ticker: 'XPML11', name: 'XP Malls', assetClass: 'FII', price: 110, dy12m: 9.5, pvp: 1, change24h: 0 },
      { ticker: 'KNRI11', name: 'Kinea Renda', assetClass: 'FII', price: 140, dy12m: 8.5, pvp: 1, change24h: 0 },
      { ticker: 'VISC11', name: 'Vinci Shop', assetClass: 'FII', price: 115, dy12m: 8.8, pvp: 1, change24h: 0 },
    ]);
    jest.spyOn(marketApiService, 'getDividends').mockResolvedValue(build12mDividends(0.1));
    jest.spyOn(marketApiService, 'fetchMacroRates').mockResolvedValue([
      { date: '2026-11-01', ipca: 4.5 },
    ]);

    const onOpenSimulator = jest.fn();
    const screen = render(
      wrap(<DividendGoalScreen onBack={jest.fn()} onOpenContributionSimulator={onOpenSimulator} />)
    );

    await waitFor(() => {
      const text = screen.getByTestId('dg-fixed-expenses-chip-text').props.children;
      const joined = Array.isArray(text) ? text.join('') : String(text);
      expect(joined).toContain('3.000');
    });

    // Tocar no chip preenche a meta mensal
    fireEvent.press(screen.getByTestId('dg-fixed-expenses-chip'));

    // Texto fixo da R51 presente
    expect(screen.getByText(R51_DISCLAIMER_TEXT)).toBeTruthy();

    // KPIs e calendário mensal presentes
    await waitFor(() => {
      expect(screen.getByTestId('dg-kpi-required-capital')).toBeTruthy();
      expect(screen.getByTestId('dg-kpi-current-income')).toBeTruthy();
      expect(screen.getByTestId('dg-calendar-bars')).toBeTruthy();
      expect(screen.getByTestId('dg-snowball-tile')).toBeTruthy();
    });

    // Salvar como cenário (kind 'dividend_goal')
    fireEvent.press(screen.getByTestId('dg-save-scenario-btn'));
    await waitFor(async () => {
      const saved = await sandboxRepository.listScenarios('dividend_goal');
      expect(saved.length).toBeGreaterThanOrEqual(1);
    });

    // "Gerar plano de aporte" chama onOpenContributionSimulator com o valor do 1º mês
    fireEvent.press(screen.getByTestId('dg-generate-plan-btn'));
    expect(onOpenSimulator).toHaveBeenCalledTimes(1);
    expect(onOpenSimulator.mock.calls[0][0]).toBeGreaterThan(0);
  });

  test('S111-T11: modo privacidade mascara valores, tile no SandboxHub está ativo e BackState fecha DividendGoal antes do Hub', async () => {
    const onOpenDividendGoal = jest.fn();
    const hub = render(
      wrap(
        <SandboxHubScreen
          onBack={jest.fn()}
          onOpenDividendGoal={onOpenDividendGoal}
          onOpenTimeMachine={jest.fn()}
          onOpenPaperPortfolio={jest.fn()}
          onOpenContributionSimulator={jest.fn()}
        />
      )
    );
    await waitFor(() => {
      expect(hub.getByTestId('sandbox-tile-meta-dividendos')).toBeTruthy();
    });
    fireEvent.press(hub.getByTestId('sandbox-tile-meta-dividendos'));
    expect(onOpenDividendGoal).toHaveBeenCalledTimes(1);

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
      isDividendGoalOpen: true,
    };
    expect(resolveBackAction(backState)).toBe('close-dividend-goal');

    // Privacidade mascara KPIs e chip
    jest.spyOn(marketApiService, 'getRanking').mockResolvedValue([]);
    jest.spyOn(marketApiService, 'fetchMacroRates').mockResolvedValue([]);
    const p = await portfolioRepository.createPortfolio({ name: 'Principal', docket_code: 'PR-1' });
    await assetRepository.createAsset({
      portfolio_id: p.id,
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      asset_class: 'FII',
      quantity: '100',
      average_price: '10.00',
    });
    await incomeRepository.addIncome({
      portfolioId: p.id,
      ticker: 'MXRF11',
      payDate: '2026-10-15',
      amount: '120.00',
    });

    const screen = render(wrap(<DividendGoalScreen isPrivacyMode={true} onBack={jest.fn()} />));
    await waitFor(() => {
      expect(screen.getByTestId('dg-kpi-required-capital')).toBeTruthy();
    });
    const reqText = screen.getByTestId('dg-kpi-required-capital').props.children;
    const curText = screen.getByTestId('dg-kpi-current-income').props.children;
    expect(String(reqText)).toContain('••••');
    expect(String(curText)).toContain('••••');
  });
});
