import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { resetDatabase } from '../../db/client';
import { sandboxRepository } from '../../repositories/sandboxRepository';
import { sandboxService } from '../../services/sandboxService';
import { marketApiService } from '../../services/marketApi';
import type { SandboxScenarioResult } from '../../domain/sandbox/backtest';
import { resolveBackAction, type BackState } from '../../navigation/backNavigation';
import { FloatingBottomDock } from '../../components/ui/FloatingBottomDock';
import { StatisticsScreen } from '../StatisticsScreen';
import { SandboxHubScreen } from '../sandbox/SandboxHubScreen';
import { TimeMachineScreen } from '../sandbox/TimeMachineScreen';

const SAFE_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const wrap = (ui: React.ReactElement) => (
  <SafeAreaProvider initialMetrics={SAFE_METRICS}>{ui}</SafeAreaProvider>
);

function makeOkResult(overrides?: Partial<SandboxScenarioResult>): SandboxScenarioResult {
  return {
    status: 'ok',
    legs: [
      {
        id: 'leg-1',
        ticker: 'PETR4',
        assetClass: 'STOCK',
        status: 'ok',
        investedBRL: 1000,
        quantity: 25,
        buyPriceBRL: 40,
        sellPriceBRL: 50,
        buyEffectiveDate: '2025-01-10',
        sellEffectiveDate: '2025-11-10',
        finalValueBRL: 1250,
        gainBRL: 250,
        gainPct: 25,
        gainUSD: null,
        gainPctUSD: null,
        dividendsGrossBRL: 80,
        dividendsWithheldBRL: 0,
        dividendsNetBRL: 80,
        taxEstimate: {
          assetClass: 'STOCK',
          taxableGainBRL: 250,
          taxRate: 0,
          estimatedTaxBRL: 0,
          exempt: true,
          ruleLabel: 'Isento (vendas <= R$ 20 mil/mês)',
          rulesVersion: '2026-01',
        },
        estimatedTaxBRL: 0,
        netFinalValueBRL: 1330,
        netGainBRL: 330,
        netGainPct: 33,
        monthlySeries: [
          { month: '2025-01', valueBRL: 1000 },
          { month: '2025-06', valueBRL: 1120 },
          { month: '2025-11', valueBRL: 1330 },
        ],
      },
    ],
    total: {
      investedBRL: 1000,
      finalValueBRL: 1250,
      gainBRL: 250,
      gainPct: 25,
      dividendsGrossBRL: 80,
      dividendsWithheldBRL: 0,
      dividendsNetBRL: 80,
      estimatedTaxBRL: 0,
      netFinalValueBRL: 1330,
      netGainBRL: 330,
      netGainPct: 33,
      taxLabel: 'IR estimado (2026-01)',
      monthlySeries: [
        { month: '2025-01', valueBRL: 1000 },
        { month: '2025-06', valueBRL: 1120 },
        { month: '2025-11', valueBRL: 1330 },
      ],
    },
    benchmarks: {
      cdi: {
        id: 'cdi',
        label: 'CDI',
        status: 'ok',
        investedBRL: 1000,
        finalValueBRL: 1110,
        gainBRL: 110,
        gainPct: 11,
        estimatedTaxBRL: 22,
        netFinalValueBRL: 1088,
        netGainBRL: 88,
        netGainPct: 8.8,
        taxLabel: 'Regressivo 20%',
      },
      ipca: {
        id: 'ipca',
        label: 'IPCA',
        status: 'ok',
        investedBRL: 1000,
        finalValueBRL: 1045,
        gainBRL: 45,
        gainPct: 4.5,
        estimatedTaxBRL: 0,
        netFinalValueBRL: 1045,
        netGainBRL: 45,
        netGainPct: 4.5,
        taxLabel: 'Referência',
      },
      poupanca: {
        id: 'poupanca',
        label: 'Poupança',
        status: 'ok',
        investedBRL: 1000,
        finalValueBRL: 1062,
        gainBRL: 62,
        gainPct: 6.2,
        estimatedTaxBRL: 0,
        netFinalValueBRL: 1062,
        netGainBRL: 62,
        netGainPct: 6.2,
        taxLabel: 'Isenta',
      },
    },
    ...overrides,
  };
}

describe('Sprint 109 — SandboxHubScreen, TimeMachineScreen e Navegação (Artboards 1 e 2, DEC-1, R48)', () => {
  beforeEach(async () => {
    await resetDatabase();
    jest.restoreAllMocks();
  });

  test('S109-T01: Botão no header de Análises abre o hub Simulador; todos os tiles navegam para sua tela e "Aporte" abre SimulatorScreen', async () => {
    const onOpenSandboxHub = jest.fn();
    const stats = render(wrap(<StatisticsScreen onOpenSandboxHub={onOpenSandboxHub} />));

    await waitFor(() => {
      expect(stats.getByTestId('stats-open-sandbox-btn')).toBeTruthy();
    });
    fireEvent.press(stats.getByTestId('stats-open-sandbox-btn'));
    expect(onOpenSandboxHub).toHaveBeenCalledTimes(1);

    const onOpenTimeMachine = jest.fn();
    const onOpenPaperPortfolio = jest.fn();
    const onOpenDividendGoal = jest.fn();
    const onOpenFire = jest.fn();
    const onOpenOpportunityCost = jest.fn();
    const onOpenStressTest = jest.fn();
    const onOpenCompare = jest.fn();
    const onOpenContributionSimulator = jest.fn();
    const hub = render(
      wrap(
        <SandboxHubScreen
          onBack={jest.fn()}
          onOpenTimeMachine={onOpenTimeMachine}
          onOpenPaperPortfolio={onOpenPaperPortfolio}
          onOpenDividendGoal={onOpenDividendGoal}
          onOpenFire={onOpenFire}
          onOpenOpportunityCost={onOpenOpportunityCost}
          onOpenStressTest={onOpenStressTest}
          onOpenCompare={onOpenCompare}
          onOpenContributionSimulator={onOpenContributionSimulator}
        />
      )
    );

    await waitFor(() => {
      expect(hub.getByTestId('sandbox-hub-screen')).toBeTruthy();
      expect(hub.getByText('Simulador')).toBeTruthy();
      expect(hub.getByText('SANDBOX')).toBeTruthy();
      expect(hub.getByText('Nada aqui mexe nas suas carteiras.')).toBeTruthy();
    });

    // Tile principal Máquina do tempo navega
    fireEvent.press(hub.getByTestId('sandbox-tile-time-machine'));
    expect(onOpenTimeMachine).toHaveBeenCalledTimes(1);

    // Tile Aporte abre o SimulatorScreen atual
    fireEvent.press(hub.getByTestId('sandbox-tile-aporte'));
    expect(onOpenContributionSimulator).toHaveBeenCalledTimes(1);

    // Todos os demais tiles do hub navegam para a sua tela
    fireEvent.press(hub.getByTestId('sandbox-tile-carteira-ficticia'));
    expect(onOpenPaperPortfolio).toHaveBeenCalledTimes(1);

    fireEvent.press(hub.getByTestId('sandbox-tile-meta-dividendos'));
    expect(onOpenDividendGoal).toHaveBeenCalledTimes(1);

    fireEvent.press(hub.getByTestId('sandbox-tile-independencia'));
    expect(onOpenFire).toHaveBeenCalledTimes(1);

    fireEvent.press(hub.getByTestId('sandbox-tile-custo-oportunidade'));
    expect(onOpenOpportunityCost).toHaveBeenCalledTimes(1);

    fireEvent.press(hub.getByTestId('sandbox-tile-teste-estresse'));
    expect(onOpenStressTest).toHaveBeenCalledTimes(1);

    fireEvent.press(hub.getByTestId('sandbox-tile-comparar'));
    expect(onOpenCompare).toHaveBeenCalledTimes(1);
  });

  test('S109-T02: Speed dial "+" da FloatingBottomDock possui pílula "Simular" que aciona onSimularPress', async () => {
    const onSimularPress = jest.fn();
    const dock = render(
      wrap(
        <FloatingBottomDock
          activeTab="stats"
          onTabChange={jest.fn()}
          onSimularPress={onSimularPress}
        />
      )
    );

    fireEvent.press(dock.getByTestId('floating-dock-action-button'));
    await waitFor(() => {
      expect(dock.getByTestId('fab-action-simular')).toBeTruthy();
      expect(dock.getByText('Simular')).toBeTruthy();
    });

    fireEvent.press(dock.getByTestId('fab-action-simular'));
    expect(onSimularPress).toHaveBeenCalledTimes(1);
  });

  test('S109-T03: Matriz de voltar do Android (BackState) fecha cada camada do sandbox na ordem correta', () => {
    const base: BackState = {
      activeTab: 'stats',
      isSettingsOpen: false,
      isTransactionDetailOpen: false,
      isAllTransactionsOpen: false,
      isClassDetailOpen: false,
      isTransactionModalOpen: false,
      isPortfolioManagerOpen: false,
      isSimulatorOpen: false,
      isSandboxHubOpen: false,
      isTimeMachineOpen: false,
    };

    const matrix: Array<[string, Partial<BackState>, string]> = [
      ['TimeMachine sobre SandboxHub', { isSandboxHubOpen: true, isTimeMachineOpen: true }, 'close-time-machine'],
      ['Simulator (Aporte) sobre SandboxHub', { isSandboxHubOpen: true, isSimulatorOpen: true }, 'close-simulator'],
      ['Perfil sobre TimeMachine', { isSandboxHubOpen: true, isTimeMachineOpen: true, isSettingsOpen: true }, 'close-settings'],
      ['SandboxHub aberto na aba Análises', { isSandboxHubOpen: true, activeTab: 'stats' }, 'close-sandbox-hub'],
      ['Aba Análises sem camadas volta para Home', { activeTab: 'stats' }, 'go-home'],
      ['Home sem camadas sai do app', { activeTab: 'home' }, 'exit'],
    ];

    for (const [label, patch, expected] of matrix) {
      expect({ label, action: resolveBackAction({ ...base, ...patch }) }).toEqual({
        label,
        action: expected,
      });
    }
  });

  test('S109-T04: Máquina do tempo permite buscar ativo (incluindo Dólar/Euro e US_STOCK), adicionar operação e renderiza gráfico com marcadores', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-10', close: 40 },
      { date: '2025-05-10', close: 35 },
      { date: '2025-11-10', close: 50 },
    ]);
    const runSpy = jest.spyOn(sandboxService, 'runTimeMachine').mockResolvedValue(makeOkResult());

    const screen = render(wrap(<TimeMachineScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('time-machine-screen')).toBeTruthy();
      expect(screen.getByText('SANDBOX')).toBeTruthy();
      expect(screen.getByText('Nada aqui mexe nas suas carteiras.')).toBeTruthy();
    });

    // Busca Dólar na primeira perna
    const searchInput = screen.getByTestId('tm-asset-search-input-0');
    fireEvent.changeText(searchInput, 'Dólar');
    await waitFor(() => {
      expect(screen.getByTestId('tm-asset-option-USDBRL')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tm-asset-option-USDBRL'));

    // Informa valor em R$
    fireEvent.changeText(screen.getByTestId('tm-amount-input-0'), '2000');

    // Adiciona segunda operação (+ Adicionar operação)
    fireEvent.press(screen.getByTestId('tm-add-leg-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('tm-asset-search-input-1')).toBeTruthy();
    });

    // Busca US_STOCK NVDA
    fireEvent.changeText(screen.getByTestId('tm-asset-search-input-1'), 'NVDA');
    await waitFor(() => {
      expect(screen.getByTestId('tm-asset-option-NVDA')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tm-asset-option-NVDA'));

    // Gráfico presente com marcadores de compra e venda
    await waitFor(() => {
      expect(screen.getByTestId('price-area-chart-container')).toBeTruthy();
      expect(screen.getByTestId('tm-simulate-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tm-simulate-btn'));

    await waitFor(() => {
      expect(runSpy).toHaveBeenCalled();
    });
  });

  test('S109-T05: Atalho "Na mínima" usa extremes da série carregada; chips "Na máxima", "Tocar no gráfico" e "Data exata" presentes', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-10', close: 42 },
      { date: '2025-03-15', close: 28 }, // mínima
      { date: '2025-08-20', close: 55 }, // máxima
      { date: '2025-11-10', close: 48 },
    ]);
    jest.spyOn(sandboxService, 'runTimeMachine').mockResolvedValue(makeOkResult());

    const screen = render(wrap(<TimeMachineScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('tm-chip-min')).toBeTruthy();
      expect(screen.getByTestId('tm-chip-max')).toBeTruthy();
      expect(screen.getByTestId('tm-chip-touch-chart')).toBeTruthy();
      expect(screen.getByTestId('tm-chip-exact-date')).toBeTruthy();
    });

    // Aguarda série carregar e pressiona "Na mínima" -> deve preencher data de compra com 2025-03-15
    await waitFor(() => {
      expect(screen.getByTestId('price-area-chart-container')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tm-chip-min'));
    await waitFor(() => {
      expect(screen.getByTestId('tm-buy-date-input-0').props.value).toBe('2025-03-15');
    });

    // Pressiona "Na máxima" -> deve preencher data de venda com 2025-08-20
    fireEvent.press(screen.getByTestId('tm-chip-max'));
    await waitFor(() => {
      expect(screen.getByTestId('tm-sell-date-input-0').props.value).toBe('2025-08-20');
    });
  });

  test('S109-T06: Resultado exibe barras Cenário × CDI × IPCA, Poupança no detalhe, dividendos reinvestidos e "Ver mês a mês"', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-10', close: 40 },
      { date: '2025-11-10', close: 50 },
    ]);
    jest.spyOn(sandboxService, 'runTimeMachine').mockResolvedValue(makeOkResult());

    const screen = render(wrap(<TimeMachineScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('tm-simulate-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tm-simulate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('tm-result-tile')).toBeTruthy();
      expect(screen.getByTestId('tm-bar-scenario')).toBeTruthy();
      expect(screen.getByTestId('tm-bar-cdi')).toBeTruthy();
      expect(screen.getByTestId('tm-bar-ipca')).toBeTruthy();
      expect(screen.getByText(/Poupança/i)).toBeTruthy();
      expect(screen.getByText(/Dividendos reinvestidos: sim/i)).toBeTruthy();
    });

    // Alternar dividendos reinvestidos para "não"
    fireEvent.press(screen.getByTestId('tm-reinvest-toggle'));
    await waitFor(() => {
      expect(screen.getByText(/Dividendos reinvestidos: não/i)).toBeTruthy();
    });

    // Abrir "Ver mês a mês"
    fireEvent.press(screen.getByTestId('tm-monthly-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('tm-monthly-list')).toBeTruthy();
      expect(screen.getByText('2025-01')).toBeTruthy();
      expect(screen.getByText('2025-11')).toBeTruthy();
    });
  });

  test('S109-T07: Interruptor de IR estimado altera taxEnabled e muda o valor líquido exibido', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-10', close: 40 },
      { date: '2025-11-10', close: 50 },
    ]);
    const runSpy = jest
      .spyOn(sandboxService, 'runTimeMachine')
      .mockImplementation(async (spec) => {
        if (spec.options.taxEnabled) {
          return makeOkResult({
            total: {
              ...makeOkResult().total,
              estimatedTaxBRL: 50,
              netFinalValueBRL: 1280,
              netGainBRL: 280,
              netGainPct: 28,
            },
          });
        }
        return makeOkResult({
          total: {
            ...makeOkResult().total,
            estimatedTaxBRL: 0,
            netFinalValueBRL: 1330,
            netGainBRL: 330,
            netGainPct: 33,
          },
        });
      });

    const screen = render(wrap(<TimeMachineScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('tm-simulate-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('tm-simulate-btn'));

    // Com IR ligado (padrão): líquido R$ 1.280,00
    await waitFor(() => {
      expect(screen.getByTestId('tm-net-final-value').props.children).toContain('1.280,00');
    });

    // Desliga interruptor de IR estimado
    fireEvent(screen.getByTestId('tm-tax-switch'), 'valueChange', false);

    await waitFor(() => {
      expect(runSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ taxEnabled: false }),
        })
      );
      expect(screen.getByTestId('tm-net-final-value').props.children).toContain('1.330,00');
    });
  });

  test('S109-T08: Perna sem dado mostra "—" e explicação sem exibir total; estado offline mostra banner', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockRejectedValue(new Error('Network offline'));
    jest.spyOn(sandboxService, 'runTimeMachine').mockResolvedValue({
      ...makeOkResult(),
      status: 'missing_data',
      legs: [
        {
          ...makeOkResult().legs[0],
          status: 'missing_data',
          missingReason: 'Sem cotação para PETR4 em 2010-01-04 (janela de 7 dias)',
          finalValueBRL: null,
          gainBRL: null,
          gainPct: null,
          netFinalValueBRL: null,
          netGainBRL: null,
          netGainPct: null,
        },
      ],
      total: {
        ...makeOkResult().total,
        finalValueBRL: null,
        gainBRL: null,
        gainPct: null,
        estimatedTaxBRL: null,
        netFinalValueBRL: null,
        netGainBRL: null,
        netGainPct: null,
        monthlySeries: [],
      },
    });

    const screen = render(wrap(<TimeMachineScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('tm-offline-banner')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('tm-simulate-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('tm-missing-data-box')).toBeTruthy();
      expect(screen.getByText('—')).toBeTruthy();
      expect(screen.getByText(/Sem cotação para PETR4 em 2010-01-04/i)).toBeTruthy();
      expect(screen.queryByTestId('tm-net-final-value')).toBeNull();
    });
  });

  test('S109-T09: Salvar cenário persiste em sandbox_scenarios e reabrir pelo Hub recalcula com os mesmos parâmetros', async () => {
    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-10', close: 40 },
      { date: '2025-11-10', close: 50 },
    ]);
    const runSpy = jest.spyOn(sandboxService, 'runTimeMachine').mockResolvedValue(makeOkResult());

    const screen = render(wrap(<TimeMachineScreen onBack={jest.fn()} />));

    await waitFor(() => {
      expect(screen.getByTestId('tm-amount-input-0')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('tm-amount-input-0'), '3500');
    fireEvent.changeText(screen.getByTestId('tm-scenario-name-input'), 'Meu teste PETR4');
    fireEvent.press(screen.getByTestId('tm-save-btn'));

    await waitFor(async () => {
      const saved = await sandboxRepository.listScenarios('time_machine');
      expect(saved.length).toBe(1);
      expect(saved[0].name).toBe('Meu teste PETR4');
    });

    const savedList = await sandboxRepository.listScenarios('time_machine');
    const onOpenTimeMachine = jest.fn();

    const hub = render(
      wrap(
        <SandboxHubScreen
          onBack={jest.fn()}
          onOpenTimeMachine={onOpenTimeMachine}
          onOpenContributionSimulator={jest.fn()}
        />
      )
    );

    await waitFor(() => {
      expect(hub.getByText('Meu teste PETR4')).toBeTruthy();
    });
    fireEvent.press(hub.getByTestId(`sandbox-saved-${savedList[0].id}`));
    expect(onOpenTimeMachine).toHaveBeenCalledWith(
      expect.objectContaining({ id: savedList[0].id, name: 'Meu teste PETR4' })
    );

    // Reabre TimeMachineScreen com initialScenario -> recalcula com os mesmos parâmetros
    runSpy.mockClear();
    render(wrap(<TimeMachineScreen initialScenario={savedList[0]} onBack={jest.fn()} />));

    await waitFor(() => {
      expect(runSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          legs: expect.arrayContaining([
            expect.objectContaining({ investedBRL: 3500 }),
          ]),
        })
      );
    });
  });

  test('S109-T10: Modo privacidade mascara todos os valores na TimeMachineScreen e SandboxHubScreen', async () => {
    await sandboxRepository.saveScenario({
      name: 'Cenário Privado',
      spec: {
        legs: [
          {
            id: 'leg-1',
            ticker: 'PETR4',
            assetClass: 'STOCK',
            investedBRL: 1000,
            buyDate: '2025-01-10',
            sellDate: '2025-11-10',
          },
        ],
        options: { reinvestDividends: true, taxEnabled: true },
      },
    });

    jest.spyOn(marketApiService, 'getPriceHistory').mockResolvedValue([
      { date: '2025-01-10', close: 40 },
      { date: '2025-11-10', close: 50 },
    ]);
    jest.spyOn(sandboxService, 'runTimeMachine').mockResolvedValue(makeOkResult());

    const hub = render(
      wrap(
        <SandboxHubScreen
          isPrivacyMode={true}
          onBack={jest.fn()}
          onOpenTimeMachine={jest.fn()}
          onOpenContributionSimulator={jest.fn()}
        />
      )
    );
    await waitFor(() => {
      expect(hub.getByText('Cenário Privado')).toBeTruthy();
    });

    const tm = render(wrap(<TimeMachineScreen isPrivacyMode={true} onBack={jest.fn()} />));
    await waitFor(() => {
      expect(tm.getByTestId('tm-simulate-btn')).toBeTruthy();
    });
    fireEvent.press(tm.getByTestId('tm-simulate-btn'));

    await waitFor(() => {
      expect(tm.getByTestId('tm-net-final-value')).toBeTruthy();
    });
    expect(tm.queryByText(/1\.330,00/)).toBeNull();
    expect(tm.queryByText(/1\.250,00/)).toBeNull();
    expect(tm.queryByText(/1\.088,00/)).toBeNull();
    expect(tm.getByTestId('tm-net-final-value').props.children).toContain('••••');
  });
});
