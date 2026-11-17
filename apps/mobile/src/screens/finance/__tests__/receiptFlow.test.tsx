import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as TextExtractor from 'expo-text-extractor';
import { useCameraPermissions } from 'expo-camera';
import { resetDatabase } from '../../../db/client';
import { finRepository } from '../../../repositories/finRepository';
import { finService } from '../../../services/finService';
import { finStore } from '../../../stores/finStore';
import { EntryFormSheet, FinanceHomeScreen, ReceiptScannerSheet } from '../index';
import { NFCE_QR_FIXTURES, RECEIPT_FIXTURES } from '../../../domain/receipt/__tests__/fixtures';

jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, loadAsync: jest.fn(() => Promise.resolve()) };
});

describe('Sprint 63 — Fluxo de tela: Fotografar cupom (OCR) e Ler QR da NFC-e', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await resetDatabase();
    finStore.resetFilters();
    finStore.setSelectedMonth('2026-11');
    await finService.initializeFinanceModule('2026-11-16');
  });

  it('exibe as 3 opções ao tocar no "+" do Resumo e abre o lançamento manual', async () => {
    render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-16" /> as any);

    await waitFor(() => {
      expect(screen.getByTestId('finance-add-entry-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('finance-add-entry-btn'));

    await waitFor(() => {
      // Sprints 75/76: o menu "+" da nav bar usa estes rótulos.
      expect(screen.getByText('Novo lançamento')).toBeTruthy();
      expect(screen.getByText('Ler cupom')).toBeTruthy();
      expect(screen.getByText('Ler QR / código')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('add-menu-manual'));

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-sheet')).toBeTruthy();
    });
  });

  it('lê cupom da galeria via OCR, pré-preenche EntryFormSheet destacando baixa confiança e nunca zera campo não lido', async () => {
    (TextExtractor.extractTextFromImage as jest.Mock).mockResolvedValueOnce(
      RECEIPT_FIXTURES.cupomIlegivelSemTotal
    );

    render(<FinanceHomeScreen onBack={jest.fn()} referenceDateIso="2026-11-16" /> as any);

    await waitFor(() => {
      expect(screen.getByTestId('finance-add-entry-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('finance-add-entry-btn'));
    fireEvent.press(screen.getByTestId('add-menu-ocr'));

    await waitFor(() => {
      expect(screen.getByTestId('receipt-gallery-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('receipt-gallery-btn'));

    await waitFor(() => {
      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
      expect(TextExtractor.extractTextFromImage).toHaveBeenCalledWith(
        'file:///mock/gallery-receipt.jpg'
      );
      expect(screen.getByTestId('entry-form-sheet')).toBeTruthy();
    });

    const amountInput = screen.getByTestId('entry-form-amount');
    expect(amountInput.props.value).toBe('');
    expect(screen.getByTestId('entry-form-ocr-review-banner')).toBeTruthy();
  });

  it('salva despesa revisada com source OCR e external_id da NFC-e e impede duplicata', async () => {
    // O módulo não cria mais conta padrão: o teste cria a sua.
    await finRepository.createAccount({ name: 'Conta Teste', type: 'checking' });
    const accounts = await finRepository.listAccounts(false);
    const categories = await finRepository.listCategories(false);
    expect(accounts.length).toBeGreaterThan(0);
    expect(categories.length).toBeGreaterThan(0);

    const key44 = '33261061585865000151650020006543219123456782';
    const draft = {
      description: 'DROGASIL FILIAL 118',
      amountCents: 15490,
      dateIso: '2026-10-15',
      categoryId: categories[0].id,
      externalId: key44,
      source: 'OCR' as const,
      lowConfidenceFields: ['description' as const],
    };

    const onSaved = jest.fn();
    const { rerender } = render(
      <EntryFormSheet
        visible={true}
        onClose={jest.fn()}
        onSaved={onSaved}
        receiptDraft={draft}
      /> as any
    );

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-amount').props.value).toBe('154,90');
      expect(screen.getByTestId('entry-form-low-confidence-description')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('entry-form-save-btn'));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
    });

    const saved = await finRepository.findEntryByExternalId(key44);
    expect(saved).not.toBeNull();
    expect((saved as any).source).toBe('OCR');
    expect((saved as any).external_id).toBe(key44);

    // Tentar salvar a mesma NFC-e novamente deve ser bloqueado
    rerender(
      <EntryFormSheet
        visible={true}
        onClose={jest.fn()}
        onSaved={onSaved}
        receiptDraft={draft}
      /> as any
    );

    await waitFor(() => {
      expect(screen.getByTestId('entry-form-save-btn')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('entry-form-save-btn'));

    await waitFor(() => {
      expect(screen.getByText(/já foi lançada|duplicad/i)).toBeTruthy();
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('lê QR da NFC-e via CameraView e pré-preenche EntryFormSheet', async () => {
    const onResult = jest.fn();
    render(
      <ReceiptScannerSheet
        visible={true}
        mode="qr"
        onClose={jest.fn()}
        onResult={onResult}
        onFallbackManual={jest.fn()}
      /> as any
    );

    await waitFor(() => {
      expect(screen.getByTestId('expo-camera-view')).toBeTruthy();
    });

    const cam = screen.getByTestId('expo-camera-view');
    fireEvent(cam, 'onBarcodeScanned', {
      type: 'qr',
      data: NFCE_QR_FIXTURES.validRjOfflineWithTotal,
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });
    const draft = onResult.mock.calls[0][0];
    expect(draft.externalId).toBe('33261061585865000151650020006543219123456782');
    expect(draft.amountCents).toBe(15490);
    expect(draft.source).toBe('OCR');
  });

  it('quando permissão da câmera é negada, exibe atalho para configurações e mantém fallback manual', async () => {
    (useCameraPermissions as jest.Mock).mockReturnValue([
      { granted: false, canAskAgain: false, status: 'denied' },
      jest.fn(async () => ({ granted: false, canAskAgain: false, status: 'denied' })),
    ]);
    const openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const onFallbackManual = jest.fn();

    render(
      <ReceiptScannerSheet
        visible={true}
        mode="ocr"
        onClose={jest.fn()}
        onResult={jest.fn()}
        onFallbackManual={onFallbackManual}
      /> as any
    );

    await waitFor(() => {
      expect(screen.getByTestId('receipt-open-settings-btn')).toBeTruthy();
      expect(screen.getByTestId('receipt-manual-fallback-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('receipt-open-settings-btn'));
    expect(openSettingsSpy).toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('receipt-manual-fallback-btn'));
    expect(onFallbackManual).toHaveBeenCalled();
  });
});
