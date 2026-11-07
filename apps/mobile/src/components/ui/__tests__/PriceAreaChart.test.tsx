import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { PriceAreaChart } from '../PriceAreaChart';

describe('UI: PriceAreaChart', () => {
  const points = [
    { date: '2026-01-01', close: 30 },
    { date: '2026-06-01', close: 34 },
    { date: '2026-11-01', close: 38.42 },
  ];

  it('renderiza os chips de período (7D, 30D, 6M, 1A, 5A, Máx)', async () => {
    await render(
      <PriceAreaChart points={points} activeRange="1A" onRangeChange={jest.fn()} />
    );

    expect(screen.getByTestId('range-chip-7D')).toBeTruthy();
    expect(screen.getByTestId('range-chip-30D')).toBeTruthy();
    expect(screen.getByTestId('range-chip-6M')).toBeTruthy();
    expect(screen.getByTestId('range-chip-1A')).toBeTruthy();
    expect(screen.getByTestId('range-chip-5A')).toBeTruthy();
    expect(screen.getByTestId('range-chip-MAX')).toBeTruthy();
  });

  it('dispara onRangeChange ao selecionar outro período', async () => {
    const onRangeChange = jest.fn();
    await render(
      <PriceAreaChart points={points} activeRange="1A" onRangeChange={onRangeChange} />
    );

    fireEvent.press(screen.getByTestId('range-chip-6M'));
    expect(onRangeChange).toHaveBeenCalledWith('6M');
  });

  it('renderiza container da área de preço e variação do período', async () => {
    await render(
      <PriceAreaChart points={points} activeRange="1A" onRangeChange={jest.fn()} />
    );

    expect(screen.getByTestId('price-area-chart-container')).toBeTruthy();
    expect(screen.getByText(/Variação 12 meses/i)).toBeTruthy();
  });
});
