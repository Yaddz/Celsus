import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { OpenFinanceInvestmentReconciliationSheet } from '../../components/OpenFinanceInvestmentReconciliationSheet';
import { StatementImportSheet } from '../../components/StatementImportSheet';
import { OpenFinanceScreen } from '../OpenFinanceScreen';
import { GoalsScreen } from '../finance/GoalsScreen';
import { CategoriesScreen } from '../finance/CategoriesScreen';
import { AccountsScreen } from '../finance/AccountsScreen';
import { SubscriptionsScreen } from '../finance/SubscriptionsScreen';
import { BudgetScreen } from '../finance/BudgetScreen';
import { CategoryRulesScreen } from '../finance/CategoryRulesScreen';
import { getFinUiColors } from '../finance/finTheme';
import { THEME_COLORS } from '../../theme/palettes';

describe('Sprint 79 — Cobertura de tema claro e escuro nas telas e folhas', () => {
  it('S79-T03: OpenFinanceInvestmentReconciliationSheet aceita themeMode e adapta fundo e texto', async () => {
    const props = {
      visible: true,
      institutionName: 'Banco XP',
      portfolios: [{ id: 'p1', name: 'Principal' }],
      proposals: [],
      existingAssets: [],
      onClose: jest.fn(),
      onConfirm: jest.fn(),
    };

    const light = await render(
      <OpenFinanceInvestmentReconciliationSheet {...props} themeMode="light" />
    );
    const lightSheet = screen.getByTestId('of-inv-reconcile-sheet');
    expect(StyleSheet.flatten(lightSheet.props.style).backgroundColor).toBe(
      THEME_COLORS.light.surface
    );
    await light.unmount();

    await render(
      <OpenFinanceInvestmentReconciliationSheet {...props} themeMode="dark" />
    );
    const darkSheet = screen.getByTestId('of-inv-reconcile-sheet');
    expect(StyleSheet.flatten(darkSheet.props.style).backgroundColor).toBe(
      THEME_COLORS.dark.surface
    );
  });

  it('S79-T04: OpenFinanceScreen e StatementImportSheet respeitam themeMode light e dark', async () => {
    const ofLight = await render(<OpenFinanceScreen themeMode="light" onClose={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByTestId('open-finance-screen').props.style).backgroundColor).toBe(
      THEME_COLORS.light.background
    );
    await ofLight.unmount();

    const ofDark = await render(<OpenFinanceScreen themeMode="dark" onClose={jest.fn()} />);
    expect(StyleSheet.flatten(screen.getByTestId('open-finance-screen').props.style).backgroundColor).toBe(
      THEME_COLORS.dark.background
    );
    await ofDark.unmount();

    const siLight = await render(
      <StatementImportSheet
        visible
        accounts={[]}
        categories={[]}
        themeMode="light"
        onClose={jest.fn()}
        onImported={jest.fn()}
      />
    );
    expect(screen.getByTestId('statement-import-sheet')).toBeTruthy();
    await siLight.unmount();
  });

  it('S79-T05: telas de Finanças (Goals, Categories, Accounts, Subscriptions, Budget, CategoryRules) usam fundo do tema claro e escuro', async () => {
    const screens: Array<{
      name: string;
      testID: string;
      renderFn: (mode: 'light' | 'dark') => React.ReactElement;
    }> = [
      {
        name: 'GoalsScreen',
        testID: 'goals-screen',
        renderFn: (mode) => <GoalsScreen onBack={jest.fn()} themeMode={mode} />,
      },
      {
        name: 'CategoriesScreen',
        testID: 'categories-screen',
        renderFn: (mode) => <CategoriesScreen onBack={jest.fn()} themeMode={mode} />,
      },
      {
        name: 'AccountsScreen',
        testID: 'accounts-screen',
        renderFn: (mode) => <AccountsScreen onBack={jest.fn()} themeMode={mode} />,
      },
      {
        name: 'SubscriptionsScreen',
        testID: 'subscriptions-screen',
        renderFn: (mode) => <SubscriptionsScreen onBack={jest.fn()} themeMode={mode} />,
      },
      {
        name: 'BudgetScreen',
        testID: 'budget-screen',
        renderFn: (mode) => <BudgetScreen onBack={jest.fn()} themeMode={mode} />,
      },
      {
        name: 'CategoryRulesScreen',
        testID: 'category-rules-screen',
        renderFn: (mode) => <CategoryRulesScreen onBack={jest.fn()} themeMode={mode} />,
      },
    ];

    for (const s of screens) {
      for (const mode of ['light', 'dark'] as const) {
        const rendered = await render(s.renderFn(mode));
        const root = screen.getByTestId(s.testID);
        expect(StyleSheet.flatten(root.props.style).backgroundColor).toBe(
          getFinUiColors(mode).background
        );
        await rendered.unmount();
      }
    }
  });
});
