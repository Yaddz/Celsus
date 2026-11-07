import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { StickyAddBar } from '../StickyAddBar';

describe('UI: StickyAddBar', () => {
  it('renderiza botão "Adicionar à carteira" quando o ativo não está na carteira', async () => {
    const onAddPress = jest.fn();
    await render(
      <StickyAddBar
        walletName="AUVP"
        assetClass="STOCK"
        targetPercentage={25}
        isAlreadyInWallet={false}
        onAddPress={onAddPress}
        onWalletSelectPress={jest.fn()}
      />
    );

    expect(screen.getByTestId('sticky-add-bar')).toBeTruthy();
    expect(screen.getByText(/Adicionar em/i)).toBeTruthy();
    expect(screen.getByText('AUVP')).toBeTruthy();
    expect(screen.getByText('Adicionar à carteira')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sticky-add-action-btn'));
    expect(onAddPress).toHaveBeenCalled();
  });

  it('renderiza selo "Na carteira" e botão "Ajustar meta" quando o ativo já pertence à carteira', async () => {
    const onAddPress = jest.fn();
    await render(
      <StickyAddBar
        walletName="AUVP"
        assetClass="STOCK"
        targetPercentage={13}
        isAlreadyInWallet={true}
        onAddPress={onAddPress}
        onWalletSelectPress={jest.fn()}
      />
    );

    expect(screen.getByText(/Na carteira · meta 13%/i)).toBeTruthy();
    expect(screen.getByText('Ajustar meta')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sticky-add-action-btn'));
    expect(onAddPress).toHaveBeenCalled();
  });

  it('abre seletor de carteiras ao tocar no chip da carteira', async () => {
    const onWalletSelectPress = jest.fn();
    await render(
      <StickyAddBar
        walletName="AUVP"
        assetClass="STOCK"
        targetPercentage={25}
        isAlreadyInWallet={false}
        onAddPress={jest.fn()}
        onWalletSelectPress={onWalletSelectPress}
      />
    );

    fireEvent.press(screen.getByTestId('wallet-selector-chip'));
    expect(onWalletSelectPress).toHaveBeenCalled();
  });
});
