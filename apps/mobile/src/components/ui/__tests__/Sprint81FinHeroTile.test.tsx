import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { bento, typography } from '../../../theme/tokens';
import { PRIVACY_CURRENCY_MASK } from '../../../services/privacyAndAuth';
import { EmptyState, ErrorState, FinHeroTile, LoadingState, SectionHeader } from '..';

function flat(testID: string): Record<string, any> {
  return (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}) as Record<string, any>;
}

describe('Sprint 81 — FinHeroTile e componentes promovidos (Fase A)', () => {
  test('S81-T11: anatomia — rótulo, valor e linha de apoio com testIDs derivados', async () => {
    await render(<FinHeroTile testID="hero" label="SALDO TOTAL" value="R$ 1.484,56" support="2 contas ativas" />);
    expect(screen.getByTestId('hero')).toBeTruthy();
    expect(screen.getByTestId('hero-label')).toHaveTextContent('SALDO TOTAL');
    expect(screen.getByTestId('hero-value')).toHaveTextContent('R$ 1.484,56');
    expect(screen.getByTestId('hero-support')).toHaveTextContent('2 contas ativas');
    expect(screen.queryByTestId('hero-action')).toBeNull();
  });

  test('S81-T12: tipografia e geometria vêm dos tokens (herói 28, raio e padding do bento)', async () => {
    await render(<FinHeroTile testID="hero" label="PATRIMÔNIO LÍQUIDO" value="R$ 10,00" />);
    const value = flat('hero-value');
    expect(value.fontFamily).toBe(typography.fontFamily);
    expect(value.fontSize).toBe(typography.sizes.hero);
    expect(value.fontWeight).toBe(typography.weights.bold);
    const tile = flat('hero');
    expect(tile.borderRadius).toBe(bento.tileRadius);
    expect(tile.padding).toBe(bento.tilePadding);
    expect(screen.queryByTestId('hero-support')).toBeNull();
  });

  test('S81-T13: variantes de cor vêm do tema (fundo e texto da variante do bento)', async () => {
    for (const variant of ['primary', 'forest', 'gold', 'dark', 'light'] as const) {
      const view = await render(<FinHeroTile testID="hero" variant={variant} label="X" value="R$ 1,00" support="apoio" />);
      expect(flat('hero').backgroundColor).toBe(bento.variants[variant].background);
      expect(flat('hero-value').color).toBe(bento.variants[variant].foreground);
      expect(flat('hero-support').color).toBe(bento.variants[variant].muted);
      await view.unmount();
    }
  });

  test('S81-T14: sem variante explícita, o tema decide (escuro → dark, claro → light)', async () => {
    const dark = await render(<FinHeroTile testID="hero" label="X" value="R$ 1,00" themeMode="dark" />);
    expect(flat('hero').backgroundColor).toBe(bento.variants.dark.background);
    await dark.unmount();
    await render(<FinHeroTile testID="hero" label="X" value="R$ 1,00" themeMode="light" />);
    expect(flat('hero').backgroundColor).toBe(bento.variants.light.background);
  });

  test('S81-T15: privacidade — o valor vira a mesma máscara de Investimentos', async () => {
    await render(<FinHeroTile testID="hero" label="X" value="R$ 1.484,56" isPrivacyMode />);
    expect(screen.getByTestId('hero-value')).toHaveTextContent(PRIVACY_CURRENCY_MASK);
    expect(screen.queryByText('R$ 1.484,56')).toBeNull();
  });

  test('S81-T16: ação opcional é pressionável e tem rótulo acessível', async () => {
    const onAction = jest.fn();
    await render(<FinHeroTile testID="hero" label="X" value="R$ 1,00" actionLabel="Ver tudo" onAction={onAction} />);
    const action = screen.getByTestId('hero-action');
    expect(action).toHaveTextContent('Ver tudo');
    fireEvent.press(action);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('S81-T17: valueTestID próprio, valor secundário e conteúdo filho', async () => {
    await render(
      <FinHeroTile
        testID="hero"
        label="GASTO COM ASSINATURAS"
        value="R$ 50,00"
        valueTestID="monthly"
        support="por mês"
        secondary={{ value: 'R$ 600,00', support: 'por ano', valueTestID: 'yearly' }}
      >
        <Text testID="extra">extra</Text>
      </FinHeroTile>
    );
    expect(screen.getByTestId('monthly')).toHaveTextContent('R$ 50,00');
    expect(screen.getByTestId('yearly')).toHaveTextContent('R$ 600,00');
    expect(screen.getByText('por ano')).toBeTruthy();
    expect(screen.getByTestId('extra')).toBeTruthy();
  });

  test('S81-T18: SectionHeader — título em caixa alta e ação "Ver tudo" opcional', async () => {
    const onAction = jest.fn();
    await render(<SectionHeader testID="sec" title="Composição" actionLabel="Ver tudo" onAction={onAction} />);
    expect(screen.getByTestId('sec-title')).toHaveTextContent('Composição');
    expect(flat('sec-title').textTransform).toBe('uppercase');
    expect(flat('sec-title').fontFamily).toBe(typography.fontFamily);
    fireEvent.press(screen.getByTestId('sec-action'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('S81-T19: EmptyState — ícone, título, frase e ação', async () => {
    const onAction = jest.fn();
    await render(
      <EmptyState testID="empty" icon="inbox" title="Nada aqui" subtitle="Adicione o primeiro" actionLabel="Adicionar" onAction={onAction} actionTestID="empty-add" />
    );
    expect(screen.getByTestId('empty')).toBeTruthy();
    expect(screen.getByText('Nada aqui')).toBeTruthy();
    expect(screen.getByText('Adicione o primeiro')).toBeTruthy();
    fireEvent.press(screen.getByTestId('empty-add'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test('S81-T20: ErrorState mostra a mensagem e tenta de novo; LoadingState usa Skeleton', async () => {
    const onRetry = jest.fn();
    const view = await render(<ErrorState message="Falhou" onRetry={onRetry} />);
    expect(screen.getByTestId('fin-error-state')).toBeTruthy();
    expect(screen.getByText('Falhou')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Tentar novamente'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await view.unmount();
    await render(<LoadingState />);
    expect(screen.getByTestId('fin-loading-state')).toBeTruthy();
  });
});
