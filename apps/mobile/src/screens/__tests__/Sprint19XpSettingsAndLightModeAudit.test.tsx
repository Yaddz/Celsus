import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SettingsBackupScreen } from '../SettingsBackupScreen';
import { PortfolioManagementScreen } from '../PortfolioManagementScreen';
import { ClassDetailScreen } from '../ClassDetailScreen';
import { TransactionDetailHistoryScreen } from '../TransactionDetailHistoryScreen';
import { StatisticsScreen } from '../StatisticsScreen';
import { TransactionScreen } from '../TransactionScreen';
import { SimulatorScreen } from '../SimulatorScreen';
import { AllTransactionsScreen } from '../AllTransactionsScreen';

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

// Mock dos serviços e repositórios para isolamento dos testes de UI
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
      { id: 'port-1', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
    ]),
    getAllPortfolios: jest.fn().mockResolvedValue([
      { id: 'port-1', name: 'Carteira Principal', docket_code: '•••• 001', is_archived: 0 },
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

describe('Sprint 19 — Módulo 7 & 9: Configurações no Padrão XP e Auditoria Completa Light Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // MÓDULO 7: TELA DE CONFIGURAÇÕES NO PADRÃO XP (SettingsBackupScreen.tsx)
  // =========================================================================
  describe('Módulo 7 — Arquitetura da Tela de Configurações no Padrão XP', () => {
    it('S19-T01: deve conter o XpMinimalHeader no topo com botão voltar que aciona onClose', async () => {
      const mockOnClose = jest.fn();
      const { getByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
          onClose={mockOnClose}
        />
      );

      // Header padrão XP
      expect(getByTestId('xp-minimal-header')).toBeDefined();

      // Botão de voltar do header
      const backBtn = getByTestId('header-back-button');
      expect(backBtn).toBeDefined();

      fireEvent.press(backBtn);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('S19-T02: deve conter o card de perfil com avatar, nome e resumo local, sem elementos de exemplo', async () => {
      const { getByTestId, getByText, queryByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
          userName="Pedro"
          userInitials="PL"
        />
      );

      // Card de Identidade do Investidor
      const profileCard = getByTestId('investor-profile-card');
      expect(profileCard).toBeDefined();

      // Iniciais do avatar e nome informados pelo chamador
      expect(getByText('PL')).toBeDefined();
      expect(getByText('Pedro')).toBeDefined();
      expect(getByTestId('profile-local-summary')).toBeDefined();

      // Elementos decorativos/de exemplo foram removidos
      expect(queryByTestId('profile-edit-avatar')).toBeNull();
      expect(queryByTestId('profile-seal')).toBeNull();
      expect(queryByTestId('profile-level-bar')).toBeNull();
      expect(queryByTestId('profile-status-pill')).toBeNull();
    });

    it('S19-T03: deve conter o bloco de carteiras com dados reais (estado vazio sem carteiras)', async () => {
      const { getByTestId, queryByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      expect(getByTestId('wallets-summary-section')).toBeDefined();
      // Sem carteiras cadastradas: estado vazio, nunca cards de exemplo
      expect(getByTestId('wallets-empty-state')).toBeDefined();
      expect(queryByTestId('wallet-summary-card-main')).toBeNull();
      expect(queryByTestId('wallet-summary-card-reserve')).toBeNull();
    });

    it('S19-T04: deve conter bloco agrupado "Personalização" com Seletor de Aparência e ausência de switch redundante de privacidade', async () => {
      const { getByTestId, queryByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      // Bloco modular Personalização
      const section = getByTestId('settings-section-personalizacao');
      expect(section).toBeDefined();

      // Modo Privacidade controlado exclusivamente pelo ícone de olho no Header XP (zero switch redundante)
      expect(queryByTestId('privacy-mode-switch')).toBeNull();

      // Seletor de Tema (Aparência: Escuro / Claro)
      expect(getByTestId('theme-option-dark')).toBeDefined();
      expect(getByTestId('theme-option-light')).toBeDefined();
    });

    it('S19-T05: deve conter bloco agrupado "Segurança" com switch de Biometria e validação', async () => {
      const { getByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      // Bloco modular Segurança
      const section = getByTestId('settings-section-seguranca');
      expect(section).toBeDefined();

      // Controles de segurança Sprint 45 (PIN e Biometria)
      expect(getByTestId('security-biometric-switch')).toBeDefined();
      expect(getByTestId('security-create-pin')).toBeDefined();
    });

    it('S19-T06: deve conter bloco agrupado "Gestão de dados (.celsus.zip)" com Exportação, Modo e Importação', async () => {
      const { getByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
        />
      );

      // Bloco modular Gestão de Dados
      const section = getByTestId('settings-section-gestao-dados');
      expect(section).toBeDefined();

      // Botão exportar dossiê .celsus.zip
      expect(getByTestId('export-dossier-btn')).toBeDefined();

      // Modo de importação (Merge vs Restore)
      expect(getByTestId('import-mode-merge')).toBeDefined();
      expect(getByTestId('import-mode-restore')).toBeDefined();

      // Botão importar backup .celsus.zip
      expect(getByTestId('import-dossier-btn')).toBeDefined();
    });
  });

  // =========================================================================
  // MÓDULO 9: AUDITORIA DE CONFORMIDADE VISUAL E CONTRASTE NO MODO CLARO
  // =========================================================================
  describe('Módulo 9 — Auditoria de Tema Claro (Light Mode: #F4F1EA / #FFFFFF / #111315)', () => {
    it('S19-T07: SettingsBackupScreen deve aplicar fundo claro #F4F1EA e tiles Bento brancos no modo light', async () => {
      const { getByTestId } = await render(
        <SettingsBackupScreen
          isPrivacyMode={false}
          onTogglePrivacyMode={jest.fn()}
          themeMode="light"
          testID="settings-backup-screen"
        />
      );

      // Fundo principal editorial
      const container = getByTestId('settings-backup-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');

      // Card de perfil como tile Bento claro
      const profileCard = getByTestId('investor-profile-card');
      const flat = StyleSheet.flatten(profileCard.props.style);
      expect(flat.backgroundColor).toBe('#FFFFFF');
      expect(flat.borderRadius).toBe(28);
    });

    it('S19-T08: PortfolioManagementScreen deve aplicar fundo claro #F4F1EA e superfícies claras no modo light', async () => {
      const { getByTestId } = await render(
        <PortfolioManagementScreen
          themeMode="light"
          testID="portfolio-management-screen"
        />
      );

      const container = getByTestId('portfolio-management-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');
    });

    it('S19-T09: ClassDetailScreen deve aplicar fundo #F4F1EA e seções planas (sem card) no modo light', async () => {
      const { getByTestId } = await render(
        <ClassDetailScreen
          themeMode="light"
          testID="class-detail-screen"
        />
      );

      const container = getByTestId('class-detail-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');

      const donutCard = getByTestId('class-donut-chart');
      expect(StyleSheet.flatten(donutCard.props.style).backgroundColor).toBe('transparent');
    });

    it('S19-T10: TransactionDetailHistoryScreen deve aplicar fundo #F4F1EA no modo light', async () => {
      const { getByTestId } = await render(
        <TransactionDetailHistoryScreen
          themeMode="light"
          testID="transaction-detail-screen"
        />
      );

      const container = getByTestId('transaction-detail-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');
    });

    it('S19-T11: StatisticsScreen deve aplicar fundo #F4F1EA e seções planas (sem card) no modo light', async () => {
      const { getByTestId } = await render(
        <StatisticsScreen
          themeMode="light"
          testID="statistics-screen"
        />
      );

      const container = getByTestId('statistics-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');

      const chartCard = getByTestId('patrimony-line-chart-card');
      expect(StyleSheet.flatten(chartCard.props.style).backgroundColor).toBe('transparent');
    });

    it('S19-T12: TransactionScreen deve aplicar fundo #F4F1EA no modo light', async () => {
      const { getByTestId } = await render(
        <TransactionScreen
          onClose={jest.fn()}
          themeMode="light"
          testID="transaction-screen"
        />
      );

      const container = getByTestId('transaction-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');
    });

    it('S19-T13: SimulatorScreen deve aplicar fundo #F4F1EA no modo light', async () => {
      const { getByTestId } = await render(
        <SimulatorScreen
          onClose={jest.fn()}
          themeMode="light"
          testID="simulator-screen"
        />
      );

      const container = getByTestId('simulator-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');
    });

    it('S19-T14: AllTransactionsScreen deve aplicar fundo #F4F1EA no modo light', async () => {
      const { getByTestId } = await render(
        <AllTransactionsScreen
          themeMode="light"
          testID="all-transactions-screen"
        />
      );

      const container = getByTestId('all-transactions-screen');
      expect(StyleSheet.flatten(container.props.style).backgroundColor).toBe('#F4F1EA');
    });
  });
});
