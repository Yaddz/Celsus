import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import App from '../../../App';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { TransactionScreen } from '../TransactionScreen';
import { SimulatorScreen } from '../SimulatorScreen';

// Mock do safe-area-context para renderização em ambiente Jest
jest.mock('react-native-safe-area-context', () => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children, style }: any) => children,
    useSafeAreaInsets: () => insets,
  };
});

// Mock dos serviços e repositórios para isolamento do teste de UI
jest.mock('../../services/marketSyncService', () => ({
  marketSyncService: {
    syncAllPortfolioTickers: jest.fn().mockResolvedValue({ totalSynced: 0, updatedQuotes: 0, errors: [] }),
  },
}));

jest.mock('../../services/transactionService', () => ({
  transactionService: {
    getTransactionsByPortfolio: jest.fn().mockResolvedValue([]),
    executeTransaction: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../../repositories/portfolioRepository', () => ({
  portfolioRepository: {
    listPortfolios: jest.fn().mockResolvedValue([
      { id: 'default-portfolio', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
    ]),
    getAllPortfolios: jest.fn().mockResolvedValue([
      { id: 'default-portfolio', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
    ]),
    getClassTargets: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../repositories/assetRepository', () => ({
  assetRepository: {
    getAssetsByPortfolio: jest.fn().mockResolvedValue([]),
    getAssetById: jest.fn().mockResolvedValue(null),
  },
}));

describe('S12-T01: TestHeaderMinimalXPGlobalHeaderRemovalAndProfileModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Home Screen Header Replacement (XpMinimalHeader and AmbientOrb)', () => {
    it('should render XpMinimalHeader on the Home screen', async () => {
      await render(<App />);
      expect(screen.getByTestId('xp-minimal-header')).toBeDefined();
    });

    it('should NOT render AmbientOrb on Home screen (solid neutral background in notch)', async () => {
      await render(<App />);
      expect(screen.queryByTestId('ambient-orb')).toBeNull();
    });

    it('should NOT render the legacy header title "GESTÃO DE CARTEIRAS" on Home screen', async () => {
      await render(<App />);
      expect(screen.queryByText(/GESTÃO DE CARTEIRAS/i)).toBeNull();
    });
  });

  describe('Profile and Settings Modal Triggered from Header Avatar', () => {
    it('should open the Profile & Settings modal when tapping user avatar in XpMinimalHeader', async () => {
      await render(<App />);

      const avatarButton = screen.getByTestId('header-avatar-button');
      expect(avatarButton).toBeDefined();

      fireEvent.press(avatarButton);

      // Verifica presença do card de Perfil do Investidor
      expect(screen.getByTestId('investor-profile-card')).toBeDefined();

      // O Perfil mostra apenas dados reais: resumo local e sem rótulos de exemplo
      expect(screen.getByTestId('profile-local-summary')).toBeDefined();
      expect(screen.queryByText(/Moderado/i)).toBeNull();

      // Verifica Configurações dentro do Perfil: Seletor de Tema
      expect(screen.getByTestId('theme-option-dark')).toBeDefined();
      expect(screen.getByTestId('theme-option-light')).toBeDefined();

      // Verifica Configurações dentro do Perfil: Segurança (PIN / Biometria)
      expect(screen.getByTestId('security-biometric-switch')).toBeDefined();

      // Verifica Configurações dentro do Perfil: Backup (.celsus.zip)
      expect(screen.getByTestId('export-dossier-btn')).toBeDefined();
    });
  });

  describe('Global Removal of Header Bars Across Secondary Screens', () => {
    it('should NOT have header bar (<View style={styles.header}>) in SettingsBackupScreen', async () => {
      await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      // O cabeçalho antigo com títulos fixos deve ser removido
      expect(screen.queryByText('SEGURANÇA & BACKUP')).toBeNull();
      expect(screen.queryByText(/100% LOCAL-FIRST • \.CELSUS\.ZIP SHA-256/i)).toBeNull();
    });

    it('should NOT have header bar (<View style={styles.header}>) in TransactionScreen', async () => {
      await render(<TransactionScreen onClose={jest.fn()} />);

      // O cabeçalho antigo "NOVA MOVIMENTAÇÃO" deve ser removido
      expect(screen.queryByText('NOVA MOVIMENTAÇÃO')).toBeNull();
      expect(screen.queryByText('LIVRO-RAZÃO TRANSACIONAL')).toBeNull();
    });

    it('should NOT have header bar (<View style={styles.header}>) in SimulatorScreen', async () => {
      await render(<SimulatorScreen onClose={jest.fn()} />);

      // O cabeçalho antigo "SIMULADOR DE APORTE" deve ser removido
      expect(screen.queryByText('SIMULADOR DE APORTE')).toBeNull();
      expect(screen.queryByText('ALOCAÇÃO POR DÉFICIT RELATIVO')).toBeNull();
    });
  });
});
