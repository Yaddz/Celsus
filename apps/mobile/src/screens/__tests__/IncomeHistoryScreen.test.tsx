import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { IncomeHistoryScreen } from '../IncomeHistoryScreen';
import { incomeRepository } from '../../repositories/incomeRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';
import { assetRepository } from '../../repositories/assetRepository';

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 48 — IncomeHistoryScreen', () => {
  const mockPortfolios = [
    { id: 'p1', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
  ];

  const mockAssets = [
    {
      id: 'a1',
      portfolio_id: 'p1',
      ticker: 'MXRF11',
      name: 'Maxi Renda',
      asset_class: 'FII',
      quantity: '637',
      average_price: '10.00', // Custo total = 6370.00
    },
  ];

  const mockAppendixCEvents = [
    { id: 'inc-1', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-05-15', amount: '60.60', kind: 'RENDIMENTO', quantity: '606', unit_amount: '0.10', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
    { id: 'inc-2', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-06-15', amount: '60.60', kind: 'RENDIMENTO', quantity: '606', unit_amount: '0.10', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
    { id: 'inc-3', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-07-14', amount: '72.70', kind: 'RENDIMENTO', quantity: '727', unit_amount: '0.10', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
    { id: 'inc-4', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-08-14', amount: '73.40', kind: 'RENDIMENTO', quantity: '734', unit_amount: '0.10', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
    { id: 'inc-5', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-08-14', amount: '10.08', kind: 'RENDIMENTO', quantity: '168', unit_amount: '0.06', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
    { id: 'inc-6', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-09-15', amount: '63.70', kind: 'RENDIMENTO', quantity: '637', unit_amount: '0.10', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
    { id: 'inc-7', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: '2026-10-15', amount: '63.70', kind: 'RENDIMENTO', quantity: '637', unit_amount: '0.10', source: 'B3_IMPORT', external_id: null, notes: null, created_at: '' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(portfolioRepository, 'listPortfolios').mockResolvedValue(mockPortfolios as any);
    jest.spyOn(assetRepository, 'listAll').mockResolvedValue(mockAssets as any);
    jest.spyOn(assetRepository, 'getAssetsByPortfolio').mockResolvedValue(mockAssets as any);
    jest.spyOn(incomeRepository, 'listAll').mockResolvedValue([...mockAppendixCEvents] as any);
    jest.spyOn(incomeRepository, 'listFiltered').mockResolvedValue([...mockAppendixCEvents] as any);
  });

  test('S48-T08: renderiza tiles, gráfico de barras e lista de proventos conforme Apêndice C', async () => {
    render(<IncomeHistoryScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('income-tile-total')).toBeTruthy();
    });

    // Total = 404,78
    expect(screen.getByTestId('income-tile-total')).toHaveTextContent('404,78');
    // Média mensal = 67,46
    expect(screen.getByTestId('income-tile-average')).toHaveTextContent('67,46');
    // Melhor mês = agosto / 83,48
    expect(screen.getByTestId('income-tile-best-month')).toHaveTextContent('83,48');

    // Quem mais pagou: MXRF11 100%
    expect(screen.getByTestId('income-ranking-card')).toHaveTextContent('MXRF11');
    expect(screen.getByTestId('income-ranking-card')).toHaveTextContent('100');

    // Lista de proventos exibe as linhas
    expect(screen.getByTestId('income-row-inc-1')).toBeTruthy();
  });

  test('S48-T09: alternância de gráfico mensal/anual e toque na barra filtra lista', async () => {
    render(<IncomeHistoryScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('income-chart-toggle-yearly')).toBeTruthy();
    });

    // Alterna para anual
    fireEvent.press(screen.getByTestId('income-chart-toggle-yearly'));
    await waitFor(() => {
      expect(screen.getByTestId('income-chart-bar-2026')).toBeTruthy();
    });

    // Volta para mensal
    fireEvent.press(screen.getByTestId('income-chart-toggle-monthly'));
    await waitFor(() => {
      expect(screen.getByTestId('income-chart-bar-2026-08')).toBeTruthy();
    });

    // Toca na barra de agosto de 2026 => filtra a lista para mostrar apenas os de agosto
    fireEvent.press(screen.getByTestId('income-chart-bar-2026-08'));
    await waitFor(() => {
      expect(screen.getByTestId('income-row-inc-4')).toBeTruthy();
      expect(screen.getByTestId('income-row-inc-5')).toBeTruthy();
      expect(screen.queryByTestId('income-row-inc-1')).toBeNull(); // maio não aparece
    });

    // Toca novamente na barra de agosto => limpa o filtro e maio volta a aparecer
    fireEvent.press(screen.getByTestId('income-chart-bar-2026-08'));
    await waitFor(() => {
      expect(screen.getByTestId('income-row-inc-1')).toBeTruthy();
    });
  });

  test('S48-T10: adicionar, editar e excluir provento persistem alterações', async () => {
    const addIncomeSpy = jest.spyOn(incomeRepository, 'addIncome').mockResolvedValue({
      id: 'inc-new',
      portfolio_id: 'p1',
      ticker: 'BTLG11',
      pay_date: '2026-11-20',
      amount: '50.00',
      kind: 'RENDIMENTO',
      quantity: '50',
      unit_amount: '1.00',
      source: 'MANUAL',
      external_id: null,
      notes: null,
      created_at: '',
    });
    const deleteIncomeSpy = jest.spyOn(incomeRepository, 'deleteIncome').mockResolvedValue();

    render(<IncomeHistoryScreen onBack={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('income-add-btn')).toBeTruthy();
    });

    // Abre formulário de adicionar
    fireEvent.press(screen.getByTestId('income-add-btn'));
    expect(screen.getByTestId('income-form-sheet')).toBeTruthy();

    // Preenche campos
    fireEvent.changeText(screen.getByTestId('income-form-ticker-input'), 'BTLG11');
    fireEvent.changeText(screen.getByTestId('income-form-amount-input'), '50,00');
    fireEvent.press(screen.getByTestId('income-form-save-btn'));

    await waitFor(() => {
      expect(addIncomeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: 'BTLG11',
          amount: '50.00',
        })
      );
    });

    // Toca na linha do inc-1 para abrir folha de detalhes
    fireEvent.press(screen.getByTestId('income-row-inc-1'));
    expect(screen.getByTestId('income-detail-sheet')).toBeTruthy();

    // Toca no botão excluir
    fireEvent.press(screen.getByTestId('income-delete-btn'));
    // Confirma exclusão
    fireEvent.press(screen.getByTestId('confirm-dialog-confirm-button'));

    await waitFor(() => {
      expect(deleteIncomeSpy).toHaveBeenCalledWith('inc-1');
    });
  });

  test('S48-T11: estado vazio renderiza botões de importar extrato da B3 e adicionar', async () => {
    jest.spyOn(incomeRepository, 'listAll').mockResolvedValue([]);
    jest.spyOn(incomeRepository, 'listFiltered').mockResolvedValue([]);
    const onOpenB3Import = jest.fn();

    render(<IncomeHistoryScreen onBack={jest.fn()} onOpenB3Import={onOpenB3Import} />);

    await waitFor(() => {
      expect(screen.getByTestId('income-empty-state')).toBeTruthy();
    });

    expect(screen.getByTestId('income-empty-b3-btn')).toBeTruthy();
    fireEvent.press(screen.getByTestId('income-empty-b3-btn'));
    expect(onOpenB3Import).toHaveBeenCalled();
  });

  test('S48-T12: Modo Privacidade mascara valores com R$ ••••••', async () => {
    render(<IncomeHistoryScreen onBack={jest.fn()} isPrivacyMode={true} />);

    await waitFor(() => {
      expect(screen.getByTestId('income-tile-total')).toBeTruthy();
    });

    expect(screen.getByTestId('income-tile-total')).toHaveTextContent('R$ ••••••');
    expect(screen.getByTestId('income-tile-average')).toHaveTextContent('R$ ••••••');
  });
});
