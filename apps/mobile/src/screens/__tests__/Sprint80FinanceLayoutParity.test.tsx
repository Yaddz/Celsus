import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { bento, layout } from '../../theme/tokens';
import { dockContentPaddingBottom } from '../../theme/layoutMetrics';
import { FinanceHomeScreen } from '../finance/FinanceHomeScreen';
import { sharedStyles } from '../finance/finTheme';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

function contentStyleOf(testID: string): Record<string, any> {
  const host = screen.getByTestId(testID);
  return (StyleSheet.flatten(host.props.contentContainerStyle) ?? {}) as Record<string, any>;
}

function expectTabScreenMargins(style: Record<string, any>) {
  expect(style.paddingHorizontal).toBe(layout.tabScreenPaddingX);
  expect(style.paddingTop).toBe(layout.tabScreenPaddingTop);
  expect(style.gap).toBe(bento.gap);
}

async function renderFinance() {
  await render(
    <FinanceHomeScreen
      onBack={jest.fn()}
      onSwitchModule={jest.fn()}
      onAvatarPress={jest.fn()}
      userName="Pedro"
      userInitials="PL"
      referenceDateIso="2026-11-16"
    />
  );
  await waitFor(() => expect(screen.getByTestId('finance-home-scroll')).toBeTruthy());
}

describe('Sprint 80 — Paridade de layout das telas raiz de Finanças (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
  });

  test('S80-T09: sharedStyles.scrollContent usa as margens de tela de aba e o gap de tiles de Investimentos', () => {
    expectTabScreenMargins(StyleSheet.flatten(sharedStyles.scrollContent) as Record<string, any>);
  });

  test('S80-T10: Resumo — margem lateral, respiro sob o header, gap e padding inferior vêm dos tokens', async () => {
    await renderFinance();
    const style = contentStyleOf('finance-home-scroll');
    expectTabScreenMargins(style);
    expect(style.paddingBottom).toBe(dockContentPaddingBottom(0));
  });

  test('S80-T11: Lançamentos — mesmas margens e padding inferior acima da nav bar', async () => {
    await renderFinance();
    fireEvent.press(screen.getByTestId('finance-dock-tab-entries'));
    await waitFor(() => expect(screen.getByTestId('entries-scroll')).toBeTruthy());
    const style = contentStyleOf('entries-scroll');
    expectTabScreenMargins(style);
    expect(style.paddingBottom).toBeGreaterThanOrEqual(dockContentPaddingBottom(0));
  });

  test('S80-T12: Contas — mesmas margens e padding inferior que cobre nav bar e botão flutuante', async () => {
    await renderFinance();
    fireEvent.press(screen.getByTestId('finance-dock-tab-accounts'));
    await waitFor(() => expect(screen.getByTestId('accounts-scroll')).toBeTruthy());
    const style = contentStyleOf('accounts-scroll');
    expectTabScreenMargins(style);
    expect(style.paddingBottom).toBe(dockContentPaddingBottom(0, { withFab: true }));
  });

  test('S80-T13: Mais — mesmas margens e padding inferior acima da nav bar', async () => {
    await renderFinance();
    fireEvent.press(screen.getByTestId('finance-dock-tab-more'));
    await waitFor(() => expect(screen.getByTestId('finance-more-scroll')).toBeTruthy());
    const style = contentStyleOf('finance-more-scroll');
    expectTabScreenMargins(style);
    expect(style.paddingBottom).toBe(dockContentPaddingBottom(0));
  });

  test('S80-T14: os testIDs das telas raiz continuam presentes depois do ajuste', async () => {
    await renderFinance();
    expect(screen.getByTestId('header-globe-button')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-entries')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-accounts')).toBeTruthy();
    expect(screen.getByTestId('finance-dock-tab-more')).toBeTruthy();
  });
});
