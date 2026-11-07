import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { IndicatorGrid } from '../IndicatorGrid';

describe('UI: IndicatorGrid', () => {
  const indicators = {
    dy: 12.4,
    pl: 5.2,
    pvp: 1.3,
    roe: 24,
    marketCap: 497000000000,
    dailyLiquidity: 1200000000,
    netMargin: 21,
    netDebtEbitda: 0.9,
  };

  it('renderiza os indicadores da classe STOCK com rótulos e valores formatados', async () => {
    await render(
      <IndicatorGrid assetClass="STOCK" indicators={indicators} />
    );

    expect(screen.getByText(/Dividend Yield/i)).toBeTruthy();
    expect(screen.getByText('12,4%')).toBeTruthy();
    expect(screen.getByText('5,2')).toBeTruthy();
    expect(screen.getByText('1,3')).toBeTruthy();
    expect(screen.getByText('R$ 497 B')).toBeTruthy();
  });

  it('renderiza "—" para indicadores com valor ausente ou nulo', async () => {
    const partial = { dy: 12.4 };
    await render(
      <IndicatorGrid assetClass="STOCK" indicators={partial} />
    );

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('abre tooltip ao tocar no rótulo de um indicador', async () => {
    await render(
      <IndicatorGrid assetClass="STOCK" indicators={indicators} />
    );

    const dyLabel = screen.getByTestId('indicator-label-dy');
    fireEvent.press(dyLabel);

    expect(screen.getByTestId('indicator-tooltip-modal')).toBeTruthy();
    expect(screen.getByText(/proventos pagos nos últimos 12 meses/i)).toBeTruthy();
  });
});
