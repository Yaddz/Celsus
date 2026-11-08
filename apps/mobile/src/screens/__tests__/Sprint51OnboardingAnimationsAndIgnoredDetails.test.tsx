import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { B3ImportScreen } from '../B3ImportScreen';
import { authService } from '../../services/authService';
import { profileRepository } from '../../repositories/profileRepository';
import { resetDatabase } from '../../db/client';
import * as DocumentPicker from 'expo-document-picker';
import { b3ImportService } from '../../services/b3ImportService';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 51: Onboarding Fluid Animations & B3 Ignored (Sem Efeito) Detailed View', () => {
  beforeEach(() => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S51-T01: OnboardingFlow transições animadas entre etapas
  // =========================================================================
  describe('S51-T01: Smooth animated step container in OnboardingFlow', () => {
    it('should render animated container and transition smoothly between steps', async () => {
      render(
        <OnboardingFlow
          authService={authService}
          profileRepository={profileRepository}
          themeMode="light"
        />
      );

      // Wrapper animado presente
      expect(screen.getByTestId('onboarding-animated-step')).toBeTruthy();
      expect(screen.getByText('Celsus')).toBeTruthy();

      // Avança para Name
      fireEvent.press(screen.getByTestId('onboarding-next'));

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-name-input')).toBeTruthy();
      });
    });
  });

  // =========================================================================
  // S51-T02: B3ImportScreen detalhamento de itens ignorados ("Sem efeito")
  // =========================================================================
  describe('S51-T02: B3ImportScreen Ignored Tile and Explanation Modal', () => {
    it('should render ignored tile with interactive trigger and display explanatory modal on tap', async () => {
      // Mock do DocumentPicker para carregar preview com itens ignorados
      const mockAsset = {
        name: 'b3-movimentacao-exemplo.xlsx',
        uri: 'file:///exemplos/b3-movimentacao-exemplo.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 5500,
      };
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [mockAsset],
      });

      render(<B3ImportScreen onBack={jest.fn()} isLight={true} />);

      // Toca em selecionar arquivo
      fireEvent.press(screen.getByTestId('b3-pick-file'));

      // Aguarda tela de preview
      await waitFor(() => {
        expect(screen.getByTestId('b3-preview-summary')).toBeTruthy();
      });

      // Tile de ignorados interativo presente
      const ignoredTile = screen.getByTestId('b3-ignored-tile');
      expect(ignoredTile).toBeTruthy();
      expect(screen.getByText(/sem efeito/i)).toBeTruthy();

      // Toca no tile de ignorados para abrir modal explicativo
      fireEvent.press(ignoredTile);

      await waitFor(() => {
        expect(screen.getByTestId('b3-ignored-modal')).toBeTruthy();
      });

      // Explicação pedagógica e botão de fechar
      expect(screen.getByText(/O que são movimentações sem efeito\?/i)).toBeTruthy();
      expect(screen.getByTestId('b3-ignored-modal-close')).toBeTruthy();

      // Fecha o modal
      fireEvent.press(screen.getByTestId('b3-ignored-modal-close'));

      await waitFor(() => {
        expect(screen.queryByTestId('b3-ignored-modal')).toBeNull();
      });
    });
  });
});
