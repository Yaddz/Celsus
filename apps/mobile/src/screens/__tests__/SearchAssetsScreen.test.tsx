import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SearchAssetsScreen } from '../SearchAssetsScreen';

describe('Screen: SearchAssetsScreen', () => {
  it('renderiza o campo de busca, chips de recentes e atalhos na tela ociosa', async () => {
    await render(
      <SearchAssetsScreen onSelectAsset={jest.fn()} />
    );

    expect(screen.getByTestId('search-assets-screen')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Nome da empresa ou ticker/i)).toBeTruthy();
    expect(screen.getByText(/MAIS BUSCADOS|RECENTES/i)).toBeTruthy();
    expect(screen.getByTestId('shortcut-tile-dividends')).toBeTruthy();
    expect(screen.getByTestId('shortcut-tile-gainers')).toBeTruthy();
  });

  it('permite filtrar por digitação e exibe resultados do catálogo', async () => {
    const onSelectAsset = jest.fn();
    await render(
      <SearchAssetsScreen onSelectAsset={onSelectAsset} />
    );

    const input = screen.getByPlaceholderText(/Nome da empresa ou ticker/i);
    fireEvent.changeText(input, 'PETR');

    const petrRow = await screen.findByTestId('asset-search-row-PETR4');
    expect(petrRow).toBeTruthy();

    fireEvent.press(petrRow);
    expect(onSelectAsset).toHaveBeenCalledWith('PETR4');
  });

  it('exibe mensagem quando nenhum ativo for encontrado', async () => {
    await render(
      <SearchAssetsScreen onSelectAsset={jest.fn()} />
    );

    const input = screen.getByPlaceholderText(/Nome da empresa ou ticker/i);
    fireEvent.changeText(input, 'INEXISTENTE123');

    const emptyMsg = await screen.findByText(/Nenhum ativo encontrado/i);
    expect(emptyMsg).toBeTruthy();
  });

  it('alterna o ranking ao tocar no atalho de Maiores dividendos', async () => {
    await render(
      <SearchAssetsScreen onSelectAsset={jest.fn()} />
    );

    fireEvent.press(screen.getByTestId('shortcut-tile-dividends'));
    expect(await screen.findByText(/Ranking/i)).toBeTruthy();
  });
});
