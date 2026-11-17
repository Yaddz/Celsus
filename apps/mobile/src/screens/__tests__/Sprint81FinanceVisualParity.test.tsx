import fs from 'fs';
import path from 'path';
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { finRepository } from '../../repositories/finRepository';
import { finService } from '../../services/finService';
import { finStore } from '../../stores/finStore';
import { PRIVACY_CURRENCY_MASK } from '../../services/privacyAndAuth';
import { bento, typography } from '../../theme/tokens';
import { AccountsScreen } from '../finance/AccountsScreen';
import { NetWorthScreen } from '../finance/NetWorthScreen';
import { SubscriptionsScreen } from '../finance/SubscriptionsScreen';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

const FINANCE_DIR = path.resolve(__dirname, '..', 'finance');
const read = (name: string): string => fs.readFileSync(path.join(FINANCE_DIR, name), 'utf8');

function flat(testID: string): Record<string, any> {
  return (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}) as Record<string, any>;
}

describe('Sprint 81 — Paridade visual de Finanças e regressão dos números (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
    await finRepository.createAccount({ name: 'Conta Teste', type: 'checking', initialBalanceCents: 123456 });
    await finRepository.createAccount({ name: 'Carteira Teste', type: 'cash', initialBalanceCents: 25000 });
  });

  test('S81-T21: os heróis de Contas, Assinaturas e Patrimônio usam FinHeroTile', () => {
    for (const name of ['AccountsScreen.tsx', 'SubscriptionsScreen.tsx', 'NetWorthScreen.tsx']) {
      expect(`${name}: ${read(name).includes('<FinHeroTile')}`).toBe(`${name}: true`);
    }
  });

  test('S81-T22: os estados de carregamento, vazio e erro vêm de src/components/ui em todas as telas', () => {
    const names = fs.readdirSync(FINANCE_DIR).filter((n: string) => n.endsWith('.tsx'));
    for (const name of names) {
      const source = read(name);
      expect(`${name}: ${/\bFin(LoadingView|ErrorView|EmptyState)\b/.test(source)}`).toBe(`${name}: false`);
    }
    const uiIndex = fs.readFileSync(path.resolve(__dirname, '..', '..', 'components', 'ui', 'index.ts'), 'utf8');
    expect(uiIndex).toContain("'./ScreenStates'");
    expect(uiIndex).toContain("'./FinHeroTile'");
    expect(uiIndex).toContain("'./SectionHeader'");
  });

  test('S81-T23: Contas — o saldo total é o mesmo de antes, no FinHeroTile, com tipografia de herói', async () => {
    await render(<AccountsScreen onBack={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('accounts-total-balance-value')).toBeTruthy());
    expect(screen.getByTestId('accounts-total-tile')).toBeTruthy();
    expect(screen.getByTestId('accounts-total-balance-tile')).toBeTruthy();
    expect(screen.getByTestId('accounts-total-balance-value')).toHaveTextContent('R$ 1.484,56');
    expect(screen.getByTestId('accounts-total-balance-tile')).toHaveTextContent(
      /SALDO TOTAL.*R\$ 1\.484,56.*2 contas ativas • cartões ficam fora do saldo/
    );
    expect(flat('accounts-total-balance-value').fontSize).toBe(typography.sizes.hero);
    expect(flat('accounts-total-balance-tile').backgroundColor).toBe(bento.variants.primary.background);
    expect(flat('accounts-total-balance-tile').borderRadius).toBe(bento.tileRadius);
  });

  test('S81-T24: Contas — com privacidade o saldo vira a máscara única', async () => {
    await render(<AccountsScreen onBack={jest.fn()} isPrivacyMode />);
    await waitFor(() => expect(screen.getByTestId('accounts-total-balance-value')).toBeTruthy());
    expect(screen.getByTestId('accounts-total-balance-value')).toHaveTextContent(PRIVACY_CURRENCY_MASK);
  });

  test('S81-T25: Patrimônio — o total é o mesmo de antes e usa a tipografia de herói', async () => {
    await render(<NetWorthScreen onBack={jest.fn()} referenceDateIso="2026-11-16" />);
    await waitFor(() => expect(screen.getByTestId('net-worth-total')).toHaveTextContent('R$ 1.484,56'));
    expect(screen.getByText('PATRIMÔNIO LÍQUIDO')).toBeTruthy();
    expect(flat('net-worth-total').fontSize).toBe(typography.sizes.hero);
  });

  test('S81-T26: Patrimônio — com privacidade o total vira a máscara única', async () => {
    await render(<NetWorthScreen onBack={jest.fn()} referenceDateIso="2026-11-16" isPrivacyMode />);
    await waitFor(() => expect(screen.getByTestId('net-worth-total')).toHaveTextContent(PRIVACY_CURRENCY_MASK));
  });

  test('S81-T27: Assinaturas — totais por mês e por ano iguais aos de antes, com os testIDs antigos', async () => {
    await render(<SubscriptionsScreen onBack={jest.fn()} referenceDateIso="2026-11-16" />);
    await waitFor(() => expect(screen.getByTestId('subscriptions-monthly-total')).toBeTruthy());
    expect(screen.getByTestId('subscriptions-summary-tile')).toHaveTextContent(
      /GASTO COM ASSINATURAS.*R\$ 0,00.*por mês.*R\$ 0,00.*por ano/
    );
    expect(screen.getByTestId('subscriptions-monthly-total')).toHaveTextContent('R$ 0,00');
    expect(screen.getByTestId('subscriptions-annual-total')).toHaveTextContent('R$ 0,00');
    expect(screen.getByTestId('subscriptions-yearly-total')).toHaveTextContent('R$ 0,00');
    expect(flat('subscriptions-summary-tile').backgroundColor).toBe(bento.variants.forest.background);
  });
});
