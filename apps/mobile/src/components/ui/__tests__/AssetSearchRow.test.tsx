import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AssetSearchRow } from '../AssetSearchRow';

describe('UI: AssetSearchRow', () => {
  const item = {
    ticker: 'PETR4',
    name: 'Petróleo Brasileiro S.A. PN',
    assetClass: 'STOCK' as const,
    price: 38.42,
    change24h: 1.8,
  };

  it('renderiza ticker, nome, preço formatado e variação percentual', async () => {
    await render(<AssetSearchRow item={item} />);

    expect(screen.getByTestId('asset-search-row-PETR4')).toBeTruthy();
    expect(screen.getByText('PETR4')).toBeTruthy();
    expect(screen.getByText('Petróleo Brasileiro S.A. PN')).toBeTruthy();
    expect(screen.getByText(/38,42/)).toBeTruthy();
    expect(screen.getByText(/\+1,80%|1,80%/)).toBeTruthy();
  });

  it('dispara callback onPress com o item selecionado ao ser tocado', async () => {
    const onPress = jest.fn();
    await render(<AssetSearchRow item={item} onPress={onPress} />);

    fireEvent.press(screen.getByTestId('asset-search-row-PETR4'));
    expect(onPress).toHaveBeenCalledWith(item);
  });

  it('renderiza variação negativa em cor de déficit', async () => {
    const negativeItem = { ...item, change24h: -2.45 };
    await render(<AssetSearchRow item={negativeItem} />);
    expect(screen.getByText(/-2,45%/)).toBeTruthy();
  });
});
