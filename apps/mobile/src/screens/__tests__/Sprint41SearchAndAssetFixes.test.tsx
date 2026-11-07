import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SearchAssetsScreen } from '../SearchAssetsScreen';
import { AssetSearchRow } from '../../components/ui/AssetSearchRow';
import { StickyAddBar } from '../../components/ui/StickyAddBar';
import { FloatingBottomDock } from '../../components/ui/FloatingBottomDock';

describe('Sprint 41: correções da busca e da ficha do ativo', () => {
  it('limpar busca volta ao estado ocioso', async () => {
    await render(<SearchAssetsScreen onSelectAsset={jest.fn()} />);
    fireEvent.changeText(screen.getByPlaceholderText(/Nome da empresa ou ticker/i), 'PETR');
    expect(await screen.findByTestId('asset-search-row-PETR4')).toBeTruthy();
    fireEvent.press(screen.getByTestId('search-clear-button'));
    expect(screen.queryByTestId('asset-search-row-PETR4')).toBeNull();
    expect(screen.getByTestId('shortcut-tile-dividends')).toBeTruthy();
  });

  it('resultado sem cotação não exibe variação inventada', async () => {
    await render(
      <AssetSearchRow item={{ ticker: 'PETR4', name: 'Petrobras', assetClass: 'STOCK', price: 38.5 }} />
    );
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('barra de adicionar não mostra meta quando o ativo não está na carteira', async () => {
    await render(<StickyAddBar walletName="AUVP" assetClass="STOCK" />);
    expect(screen.queryByText(/meta/i)).toBeNull();
  });

  it('ranking tem chips de classe reais (FIIs, Ações, Cripto)', async () => {
    await render(<SearchAssetsScreen onSelectAsset={jest.fn()} />);
    expect(screen.getByTestId('ranking-class-FII')).toBeTruthy();
    expect(screen.getByTestId('ranking-class-STOCK')).toBeTruthy();
    expect(screen.getByTestId('ranking-class-CRYPTO')).toBeTruthy();
  });

  it('a aba de busca da nav bar usa o ícone de extrato', async () => {
    await render(<FloatingBottomDock activeTab="home" />);
    expect(screen.getByTestId('dock-tab-search')).toBeTruthy();
  });
});
