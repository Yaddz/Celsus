import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FloatingBottomDock, type DockActionItem, type DockTabItem } from '../FloatingBottomDock';

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 76 — FloatingBottomDock configurável por props (Fase A)', () => {
  test('S76-T03: mantém padrões de Investimentos intactos quando tabs/actions não são passados', async () => {
    const onTabChange = jest.fn();
    await render(<FloatingBottomDock activeTab="home" onTabChange={onTabChange} />);

    expect(screen.getByTestId('dock-tab-home')).toBeTruthy();
    expect(screen.getByTestId('dock-tab-stats')).toBeTruthy();
    expect(screen.getByTestId('dock-tab-search')).toBeTruthy();
    expect(screen.getByTestId('dock-tab-wallets')).toBeTruthy();
    expect(screen.getByTestId('floating-dock-action-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('floating-dock-action-button'));
    expect(screen.getByTestId('fab-action-nova-carteira')).toBeTruthy();
    expect(screen.getByTestId('fab-action-adicionar-ativo')).toBeTruthy();
    expect(screen.getByTestId('fab-action-novo-aporte')).toBeTruthy();
  });

  test('S76-T04: aceita tabs, actions, tabTestIdPrefix e actionButtonTestID customizados para Finanças', async () => {
    type FinTab = 'home' | 'entries' | 'accounts' | 'more';
    const finTabs: DockTabItem<FinTab>[] = [
      { id: 'home', iconName: 'dashboard', label: 'Resumo' },
      { id: 'entries', iconName: 'receipt-long', label: 'Lançamentos' },
      { id: 'accounts', iconName: 'account-balance-wallet', label: 'Contas' },
      { id: 'more', iconName: 'more-horiz', label: 'Mais' },
    ];
    const onManual = jest.fn();
    const finActions: DockActionItem[] = [
      {
        id: 'manual',
        testID: 'add-menu-manual',
        icon: 'edit',
        label: 'Novo lançamento',
        sub: 'Receita ou despesa',
        tint: 'primary',
        onPress: onManual,
      },
    ];
    const onTabChange = jest.fn();

    await render(
      <FloatingBottomDock<FinTab>
        testID="finance-dock"
        tabTestIdPrefix="finance-dock-tab-"
        actionButtonTestID="finance-add-entry-btn"
        activeTab="home"
        tabs={finTabs}
        actions={finActions}
        onTabChange={onTabChange}
      />
    );

    expect(screen.getByTestId('finance-dock')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-home')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-entries')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-accounts')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-more')).toBeTruthy();

    fireEvent.press(screen.getByTestId('finance-dock-tab-accounts'));
    expect(onTabChange).toHaveBeenCalledWith('accounts');

    fireEvent.press(screen.getByTestId('finance-add-entry-btn'));
    expect(screen.getByTestId('add-menu-manual')).toBeTruthy();
    fireEvent.press(screen.getByTestId('add-menu-manual'));
    expect(onManual).toHaveBeenCalledTimes(1);
  });
});
