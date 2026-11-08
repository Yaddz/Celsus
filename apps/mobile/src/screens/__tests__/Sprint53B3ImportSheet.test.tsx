import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { B3ImportSheet } from '../../components/B3ImportSheet';
import { B3ImportScreen } from '../B3ImportScreen';
import { resetDatabase } from '../../db/client';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 44, right: 0, bottom: 34, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 53 — Frente A: B3ImportSheet & Embedded Screen', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
  });

  const mockSampleFile = {
    name: 'b3-movimentacao-exemplo.xlsx',
    uri: 'file:///exemplos/b3-movimentacao-exemplo.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 5500,
  };

  it('S53-T04: opens in pick step collapsed, then expands upon file pick and renders preview summary', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [mockSampleFile],
    });

    const onClose = jest.fn();
    render(
      <B3ImportSheet
        visible={true}
        onClose={onClose}
        isLight={false}
      />
    );

    // Deve renderizar a tela de importação B3 no passo 'pick'
    expect(screen.getByTestId('b3-import-screen')).toBeTruthy();
    expect(screen.getByTestId('b3-pick-file')).toBeTruthy();

    // Seleciona arquivo
    fireEvent.press(screen.getByTestId('b3-pick-file'));

    // Aguarda preview com sheet expandido
    await waitFor(() => {
      expect(screen.getByTestId('b3-preview-summary')).toBeTruthy();
    });

    expect(screen.getByTestId('b3-confirm-import')).toBeTruthy();
  });

  it('S53-T05: preview renders summary tiles, and b3-ignored-tile opens b3-ignored-modal', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [mockSampleFile],
    });

    render(
      <B3ImportSheet
        visible={true}
        onClose={jest.fn()}
        isLight={true}
      />
    );

    fireEvent.press(screen.getByTestId('b3-pick-file'));

    await waitFor(() => {
      expect(screen.getByTestId('b3-preview-summary')).toBeTruthy();
    });

    // Tile de ignorados ("Sem efeito")
    const ignoredTile = screen.getByTestId('b3-ignored-tile');
    expect(ignoredTile).toBeTruthy();
    fireEvent.press(ignoredTile);

    await waitFor(() => {
      expect(screen.getByTestId('b3-ignored-modal')).toBeTruthy();
    });

    // Fecha o modal de ignorados
    fireEvent.press(screen.getByTestId('b3-ignored-modal-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('b3-ignored-modal')).toBeNull();
    });
  });

  it('S53-T06: confirming import runs importing step, then shows report and metas configure CTA', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [mockSampleFile],
    });

    const onNavigateToPortfolio = jest.fn();
    render(
      <B3ImportSheet
        visible={true}
        onClose={jest.fn()}
        onNavigateToPortfolio={onNavigateToPortfolio}
      />
    );

    fireEvent.press(screen.getByTestId('b3-pick-file'));

    await waitFor(() => {
      expect(screen.getByTestId('b3-confirm-import')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('b3-confirm-import'));

    // Aguarda relatório final
    await waitFor(() => {
      expect(screen.getByTestId('b3-report')).toBeTruthy();
    });

    expect(screen.getByTestId('b3-report-configure-metas')).toBeTruthy();
  });

  it('S53-T07: B3ImportScreen embedded mode calls onStepChange and close button preserves testID xp-header-back', async () => {
    const onBack = jest.fn();
    const onStepChange = jest.fn();

    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
      canceled: false,
      assets: [mockSampleFile],
    });

    render(
      <B3ImportScreen
        embedded={true}
        onBack={onBack}
        onStepChange={onStepChange}
      />
    );

    // O botão de fechar deve preservar o testID xp-header-back
    const backBtn = screen.getByTestId('xp-header-back');
    expect(backBtn).toBeTruthy();
    fireEvent.press(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);

    // Inicia seleção e valida que onStepChange é acionado
    fireEvent.press(screen.getByTestId('b3-pick-file'));

    await waitFor(() => {
      expect(onStepChange).toHaveBeenCalledWith('preview');
    });
  });
});
