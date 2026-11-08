import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StatisticsScreen } from '../StatisticsScreen';
import { incomeRepository } from '../../repositories/incomeRepository';
import { portfolioRepository } from '../../repositories/portfolioRepository';

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 48 — StatisticsScreen Income Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(portfolioRepository, 'listPortfolios').mockResolvedValue([
      { id: 'p1', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 } as any,
    ]);
    jest.spyOn(incomeRepository, 'listAll').mockResolvedValue([
      { id: '1', portfolio_id: 'p1', ticker: 'MXRF11', pay_date: `${new Date().getFullYear()}-05-15`, amount: '150.00', kind: 'RENDIMENTO', quantity: null, unit_amount: null, source: 'MANUAL', external_id: null, notes: null, created_at: '' } as any,
    ]);
  });

  test('S48-T13: card de proventos possui ação para abrir histórico e formulário antigo foi removido', async () => {
    const onOpenIncomeHistory = jest.fn();
    render(<StatisticsScreen onOpenIncomeHistory={onOpenIncomeHistory} />);

    await waitFor(() => {
      expect(screen.getByTestId('stats-income-tile')).toBeTruthy();
    });

    // Clica no card ou botão de histórico
    const openBtn = screen.getByTestId('stats-open-income-history-btn');
    expect(openBtn).toBeTruthy();
    fireEvent.press(openBtn);
    expect(onOpenIncomeHistory).toHaveBeenCalled();

    // Formulário manual antigo não existe mais nesta tela
    expect(screen.queryByTestId('income-sheet')).toBeNull();
  });
});
