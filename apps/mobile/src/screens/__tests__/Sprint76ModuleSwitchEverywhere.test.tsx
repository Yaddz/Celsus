import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { SearchAssetsScreen } from '../SearchAssetsScreen';
import { StatisticsScreen } from '../StatisticsScreen';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 76 — Troca de módulo e Perfil nas telas dos dois módulos (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
  });

  test('S76-T05: StatisticsScreen, SearchAssetsScreen e PortfolioManagementScreen repassam onSwitchModule para o botão do header', async () => {
    const onSwitchStats = jest.fn();
    await render(<StatisticsScreen onSwitchModule={onSwitchStats} />);
    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitchStats).toHaveBeenCalledTimes(1);

    const onSwitchSearch = jest.fn();
    await render(<SearchAssetsScreen onSelectAsset={jest.fn()} onSwitchModule={onSwitchSearch} />);
    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitchSearch).toHaveBeenCalledTimes(1);

    const onSwitchWallets = jest.fn();
    await render(<PortfolioManagementScreen onSwitchModule={onSwitchWallets} />);
    await waitFor(() => expect(screen.getByTestId('header-globe-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitchWallets).toHaveBeenCalledTimes(1);
  });

  test('S76-T06: FinanceHomeScreen mostra avatar nas 4 telas raiz (Resumo, Lançamentos, Contas, Mais), abre Perfil e troca de módulo em qualquer tela', async () => {
    const onSwitchModule = jest.fn();
    const onAvatarPress = jest.fn();

    await render(
      <FinanceHomeScreen
        onBack={jest.fn()}
        onSwitchModule={onSwitchModule}
        onAvatarPress={onAvatarPress}
        userName="Pedro"
        userInitials="PL"
        referenceDateIso="2026-11-16"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('header-avatar-button')).toBeTruthy();
      expect(screen.getByTestId('header-globe-icon').props.name).toBe('account-balance');
    });

    fireEvent.press(screen.getByTestId('header-avatar-button'));
    expect(onAvatarPress).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitchModule).toHaveBeenCalledTimes(1);

    // Navega para Lançamentos (raiz da aba) -> mantém avatar e ícone do módulo
    fireEvent.press(screen.getByTestId('finance-dock-tab-entries'));
    await waitFor(() => {
      expect(screen.getByTestId('header-avatar-button')).toBeTruthy();
      expect(screen.getByTestId('header-globe-button')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitchModule).toHaveBeenCalledTimes(2);

    // Abre Orçamento (tela interna via Mais) -> tem voltar + ícone do módulo
    fireEvent.press(screen.getByTestId('finance-dock-tab-more'));
    await waitFor(() => expect(screen.getByTestId('header-avatar-button')).toBeTruthy());
    fireEvent.press(screen.getByText('Orçamento'));
    await waitFor(() => expect(screen.getByTestId('budget-screen')).toBeTruthy());
    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitchModule).toHaveBeenCalledTimes(3);
  });
});
