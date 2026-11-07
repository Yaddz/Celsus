import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DividendsCard } from '../DividendsCard';

describe('UI: DividendsCard', () => {
  const dividends = [
    { date: '2026-08-20', type: 'DIVIDEND', amount: 0.87 },
    { date: '2026-05-20', type: 'JCP', amount: 0.52 },
    { date: '2026-02-15', type: 'DIVIDEND', amount: 1.25 },
    { date: '2025-11-20', type: 'DIVIDEND', amount: 2.12 },
  ];

  it('renderiza total dos últimos 12 meses por ação e badge de frequência', async () => {
    await render(
      <DividendsCard dividends={dividends} currentPrice={38.42} />
    );

    expect(screen.getByTestId('dividends-card')).toBeTruthy();
    expect(screen.getByText(/R\$ 4,76 por ação/i)).toBeTruthy();
    expect(screen.getByText('Trimestral')).toBeTruthy();
  });

  it('renderiza mini barras com destaque no maior provento', async () => {
    await render(
      <DividendsCard dividends={dividends} currentPrice={38.42} />
    );

    expect(screen.getByTestId('mini-bar-highest')).toBeTruthy();
  });

  it('renderiza lista de proventos recentes com tipo, data e valor', async () => {
    await render(
      <DividendsCard dividends={dividends} currentPrice={38.42} />
    );

    expect(screen.getByText('Dividendos')).toBeTruthy();
    expect(screen.getByText('Pago em 20/08')).toBeTruthy();
    expect(screen.getByText('R$ 0,87')).toBeTruthy();
    expect(screen.getByText('JCP')).toBeTruthy();
  });
});
