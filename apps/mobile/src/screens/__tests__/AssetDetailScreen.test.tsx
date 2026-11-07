import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AssetDetailScreen } from '../AssetDetailScreen';

describe('Screen: AssetDetailScreen', () => {
  it('renderiza ticker, botão voltar, card do ativo e botão de adicionar à carteira', async () => {
    const onBack = jest.fn();
    const onAddAsset = jest.fn();

    await render(
      <AssetDetailScreen ticker="PETR4" onBack={onBack} onAddAsset={onAddAsset} />
    );

    expect(screen.getByTestId('asset-detail-screen')).toBeTruthy();
    expect(screen.getByTestId('header-back-button')).toBeTruthy();

    fireEvent.press(screen.getByTestId('header-back-button'));
    expect(onBack).toHaveBeenCalled();

    const addBtn = screen.getByTestId('sticky-add-action-btn');
    fireEvent.press(addBtn);
    expect(onAddAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'PETR4',
      })
    );
  });

  it('renderiza indicadores e ficha da empresa', async () => {
    await render(
      <AssetDetailScreen ticker="PETR4" onBack={jest.fn()} />
    );

    expect(await screen.findByText(/INDICADORES/i)).toBeTruthy();
    expect(await screen.findByText(/SOBRE A EMPRESA/i)).toBeTruthy();
  });
});
