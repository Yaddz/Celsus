import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { resetDatabase } from '../../db/client';
import { ACCESS_KEY_S75_FIXTURES } from '../../domain/receipt/__tests__/fixtures';
import { finService } from '../../services/finService';
import { nfceLookupService } from '../../services/nfceLookupService';
import { EntryFormSheet } from '../finance/EntryFormSheet';
import { ReceiptScannerSheet } from '../finance/ReceiptScannerSheet';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 75 — Modos do leitor de cupom, fallback de total e diagnóstico (Fase A)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await finService.initializeFinanceModule('2026-11-16');
    jest.restoreAllMocks();
  });

  test('S75-T09: ReceiptScannerSheet tem seletor de modo, barra de código 128 + QR, e entrada manual de 44 dígitos com erro em DV inválido', async () => {
    const onResult = jest.fn();
    await render(
      <ReceiptScannerSheet
        visible={true}
        mode="qr"
        onClose={jest.fn()}
        onResult={onResult}
        onFallbackManual={jest.fn()}
      />
    );

    const camera = screen.getByTestId('expo-camera-view');
    expect(camera.props.barcodeScannerSettings?.barcodeTypes).toEqual(
      expect.arrayContaining(['qr', 'code128'])
    );

    // Alterna para o modo Digitar chave
    fireEvent.press(screen.getByText('Digitar chave'));
    await waitFor(() => {
      expect(screen.getByTestId('receipt-key-input')).toBeTruthy();
      expect(screen.getByTestId('receipt-key-confirm-btn')).toBeTruthy();
    });

    // Digita chave com DV inválido -> mostra erro e não chama onResult
    fireEvent.changeText(
      screen.getByTestId('receipt-key-input'),
      '53261147508411000156650010001234561876543210'
    );
    fireEvent.press(screen.getByTestId('receipt-key-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('receipt-scanner-error')).toBeTruthy();
    });
    expect(onResult).not.toHaveBeenCalled();

    // Digita chave válida -> pede captura do total (ou permite pular)
    fireEvent.changeText(
      screen.getByTestId('receipt-key-input'),
      ACCESS_KEY_S75_FIXTURES.nfe55
    );
    fireEvent.press(screen.getByTestId('receipt-key-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByText(/Agora aponte para o total do cupom/i)).toBeTruthy();
    });

    // Pular captura -> abre formulário com externalId = chave
    fireEvent.press(screen.getByTestId('receipt-skip-total-ocr-btn'));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: ACCESS_KEY_S75_FIXTURES.nfe55,
        amountCents: null,
      })
    );
  });

  test('S75-T10: QR online sem valor com SEFAZ desligada pede captura do total; com SEFAZ ligada preenche direto sem nova captura', async () => {
    await nfceLookupService.setEnabled(false);
    const onResult = jest.fn();
    await render(
      <ReceiptScannerSheet
        visible={true}
        mode="qr"
        onClose={jest.fn()}
        onResult={onResult}
        onFallbackManual={jest.fn()}
      />
    );

    const camera = screen.getByTestId('expo-camera-view');
    fireEvent(camera, 'barcodeScanned', { data: ACCESS_KEY_S75_FIXTURES.dfOnlineQr });

    await waitFor(() => {
      expect(screen.getByText(/Agora aponte para o total do cupom/i)).toBeTruthy();
    });
    expect(onResult).not.toHaveBeenCalled();
  });

  test('S75-T11: EntryFormSheet exibe "Ver texto lido" (entry-form-receipt-raw-text) quando cupom tem valor ausente ou baixa confiança', async () => {
    await render(
      <EntryFormSheet
        visible={true}
        onClose={jest.fn()}
        receiptDraft={{
          description: 'MERCADO TESTE',
          amountCents: null,
          dateIso: '2026-11-16',
          categoryId: null,
          externalId: null,
          source: 'OCR',
          lowConfidenceFields: ['amount'],
          rawLines: ['MERCADO TESTE', 'TOTAL ILEGIVEL'],
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-receipt-raw-text')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('entry-form-receipt-raw-text'));
    await waitFor(() => {
      expect(screen.getByText(/TOTAL ILEGIVEL/)).toBeTruthy();
    });
  });
});
