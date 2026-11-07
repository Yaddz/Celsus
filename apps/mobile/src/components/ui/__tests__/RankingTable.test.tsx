import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { RankingTable } from '../RankingTable';
import { RankingItem } from '../../../domain/finance/assetProfile';

describe('UI: RankingTable', () => {
  const items: RankingItem[] = [
    { ticker: 'KNCR11', name: 'Kinea Rendimentos', assetClass: 'FII', price: 104.98, dy12m: 14.3, pvp: 1.02, change24h: 0.5 },
    { ticker: 'MXRF11', name: 'Maxi Renda', assetClass: 'FII', price: 8.79, dy12m: 12.1, pvp: 0.95, change24h: -0.2 },
  ];

  it('renderiza cabeçalhos da tabela e linhas com preço, DY e P/VP', async () => {
    await render(
      <RankingTable items={items} onRowPress={jest.fn()} />
    );

    expect(screen.getByTestId('ranking-table')).toBeTruthy();
    expect(screen.getByText(/Ativo/i)).toBeTruthy();
    expect(screen.getByText(/Preço/i)).toBeTruthy();
    expect(screen.getByText(/DY 12M/i)).toBeTruthy();
    expect(screen.getByText(/P\/VP/i)).toBeTruthy();

    expect(screen.getByText('KNCR11')).toBeTruthy();
    expect(screen.getByText('104,98')).toBeTruthy();
    expect(screen.getByText('14,3%')).toBeTruthy();
    expect(screen.getByText('1,02')).toBeTruthy();
  });

  it('alterna ordenação ao clicar no cabeçalho DY 12M', async () => {
    const onSortChange = jest.fn();
    await render(
      <RankingTable items={items} onSortChange={onSortChange} onRowPress={jest.fn()} />
    );

    fireEvent.press(screen.getByTestId('ranking-header-dy'));
    expect(onSortChange).toHaveBeenCalledWith('dy');
  });

  it('dispara onRowPress ao clicar em uma linha', async () => {
    const onRowPress = jest.fn();
    await render(
      <RankingTable items={items} onRowPress={onRowPress} />
    );

    fireEvent.press(screen.getByTestId('ranking-row-KNCR11'));
    expect(onRowPress).toHaveBeenCalledWith('KNCR11');
  });
});
