import React from 'react';
import * as RN from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SettingsBackupScreen } from '../SettingsBackupScreen';

describe('Sprint 78 — Perfil: base comum e seções por módulo', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('S78-T01: em tela estreita com origem Investimentos, mostra Geral -> Investimentos (aberta) -> Finanças (recolhida) -> Proteção -> Conexões e dados, e expande Finanças ao toque', async () => {
    jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 2,
      fontScale: 1,
    });

    await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
        originModule="investments"
        onOpenB3Import={jest.fn()}
        onOpenOpenFinance={jest.fn()}
        onOpenFinanceRoute={jest.fn()}
        onOpenFinanceStatementImport={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-section-investments')).toBeTruthy();
      expect(screen.getByTestId('profile-section-finance')).toBeTruthy();
    });

    // Investimentos aberta por padrão
    expect(screen.getByTestId('wallets-summary-section')).toBeTruthy();
    expect(screen.getByTestId('import-b3-btn')).toBeTruthy();
    expect(screen.getByTestId('import-spreadsheet-btn')).toBeTruthy();
    expect(screen.getByTestId('profile-investments-income-history-btn')).toBeTruthy();

    // Finanças recolhida por padrão
    expect(screen.queryByTestId('profile-reminders-tile')).toBeNull();
    expect(screen.queryByTestId('profile-finance-categories-btn')).toBeNull();

    // Verificar ordem na árvore: Geral -> Investimentos -> Finanças -> Proteção -> Conexões e dados
    const json = JSON.stringify(screen.toJSON());
    const idxGeneral = json.indexOf('profile-group-account');
    const idxInv = json.indexOf('profile-section-investments');
    const idxFin = json.indexOf('profile-section-finance');
    const idxProt = json.indexOf('profile-group-protection');
    const idxData = json.indexOf('profile-group-data');
    expect(idxGeneral).toBeGreaterThan(-1);
    expect(idxInv).toBeGreaterThan(idxGeneral);
    expect(idxFin).toBeGreaterThan(idxInv);
    expect(idxProt).toBeGreaterThan(idxFin);
    expect(idxData).toBeGreaterThan(idxProt);

    // Expandir Finanças ao toque
    fireEvent.press(screen.getByTestId('profile-section-finance-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('profile-reminders-tile')).toBeTruthy();
      expect(screen.getByTestId('profile-finance-categories-btn')).toBeTruthy();
      expect(screen.getByTestId('profile-finance-rules-btn')).toBeTruthy();
      expect(screen.getByTestId('profile-finance-import-btn')).toBeTruthy();
      expect(screen.getByTestId('profile-finance-accounts-btn')).toBeTruthy();
    });
  });

  it('S78-T02: em tela estreita com origem Finanças, Finanças vem aberta antes de Investimentos (recolhida) e expande Investimentos ao toque', async () => {
    jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 2,
      fontScale: 1,
    });

    await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
        originModule="finance"
        onOpenB3Import={jest.fn()}
        onOpenOpenFinance={jest.fn()}
        onOpenFinanceRoute={jest.fn()}
        onOpenFinanceStatementImport={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-reminders-tile')).toBeTruthy();
    });

    expect(screen.getByTestId('profile-finance-categories-btn')).toBeTruthy();
    expect(screen.queryByTestId('wallets-summary-section')).toBeNull();
    expect(screen.queryByTestId('import-b3-btn')).toBeNull();

    const json = JSON.stringify(screen.toJSON());
    const idxFin = json.indexOf('profile-section-finance');
    const idxInv = json.indexOf('profile-section-investments');
    expect(idxFin).toBeGreaterThan(-1);
    expect(idxInv).toBeGreaterThan(idxFin);

    fireEvent.press(screen.getByTestId('profile-section-investments-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('wallets-summary-section')).toBeTruthy();
      expect(screen.getByTestId('import-b3-btn')).toBeTruthy();
      expect(screen.getByTestId('import-spreadsheet-btn')).toBeTruthy();
    });
  });

  it('S78-T03: em largura >= 720 px usa duas colunas: base comum à esquerda e as duas seções de módulo abertas à direita', async () => {
    jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
      width: 820,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });

    await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
        originModule="investments"
        onOpenB3Import={jest.fn()}
        onOpenOpenFinance={jest.fn()}
        onOpenFinanceRoute={jest.fn()}
        onOpenFinanceStatementImport={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-column-left')).toBeTruthy();
      expect(screen.getByTestId('profile-column-right')).toBeTruthy();
    });

    const leftCol = within(screen.getByTestId('profile-column-left'));
    const rightCol = within(screen.getByTestId('profile-column-right'));

    // Base comum na coluna esquerda
    expect(leftCol.getByTestId('profile-group-account')).toBeTruthy();
    expect(leftCol.getByTestId('profile-group-protection')).toBeTruthy();
    expect(leftCol.getByTestId('profile-group-data')).toBeTruthy();

    // Ambas as seções abertas na coluna direita
    expect(rightCol.getByTestId('profile-section-investments')).toBeTruthy();
    expect(rightCol.getByTestId('profile-section-finance')).toBeTruthy();
    expect(rightCol.getByTestId('wallets-summary-section')).toBeTruthy();
    expect(rightCol.getByTestId('profile-reminders-tile')).toBeTruthy();
  });

  it('S78-T04: preserva todos os testIDs antigos e garante que nenhum item aparece duplicado', async () => {
    jest.spyOn(RN.Dimensions, 'get').mockReturnValue({
      width: 820,
      height: 1024,
      scale: 2,
      fontScale: 1,
    });

    await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
        onClose={jest.fn()}
        originModule="investments"
        onOpenB3Import={jest.fn()}
        onOpenOpenFinance={jest.fn()}
        onOpenFinanceRoute={jest.fn()}
        onOpenFinanceStatementImport={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-reminders-tile')).toBeTruthy();
    });

    const uniqueTestIds = [
      'close-settings-btn',
      'privacy-mode-switch',
      'profile-group-account',
      'profile-card-account',
      'profile-group-protection',
      'profile-card-protection',
      'profile-group-data',
      'profile-card-data',
      'settings-section-seguranca',
      'settings-section-gestao-dados',
      'open-finance-entry-btn',
      'wallets-summary-section',
      'import-b3-btn',
      'import-spreadsheet-btn',
      'profile-reminders-tile',
      'profile-section-investments',
      'profile-section-finance',
    ];

    for (const id of uniqueTestIds) {
      expect(screen.getAllByTestId(id)).toHaveLength(1);
    }

    // Expandir Backup para checar export-dossier-btn e import-dossier-btn únicos
    fireEvent.press(screen.getByTestId('backup-row'));
    await waitFor(() => {
      expect(screen.getAllByTestId('export-dossier-btn')).toHaveLength(1);
      expect(screen.getAllByTestId('import-dossier-btn')).toHaveLength(1);
    });
  });
});
