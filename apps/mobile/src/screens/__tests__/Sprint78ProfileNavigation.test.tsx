import React from 'react';
import { BackHandler } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../../../App';
import { resetDatabase } from '../../db/client';
import { SettingsBackupScreen } from '../SettingsBackupScreen';

describe('Sprint 78 — Perfil: navegação dos atalhos por módulo', () => {
  beforeEach(async () => {
    await resetDatabase();
    jest.restoreAllMocks();
  });

  it('S78-T05: atalhos de Finanças no Perfil fecham o Perfil e abrem a rota certa no módulo Finanças', async () => {
    const onClose = jest.fn();
    const onOpenFinanceRoute = jest.fn();
    const onOpenFinanceStatementImport = jest.fn();

    await render(
      <SettingsBackupScreen
        isPrivacyMode={false}
        onTogglePrivacyMode={jest.fn()}
        onClose={onClose}
        originModule="finance"
        onOpenFinanceRoute={onOpenFinanceRoute}
        onOpenFinanceStatementImport={onOpenFinanceStatementImport}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('profile-finance-categories-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('profile-finance-categories-btn'));
    expect(onOpenFinanceRoute).toHaveBeenCalledWith('categories');

    fireEvent.press(screen.getByTestId('profile-finance-rules-btn'));
    expect(onOpenFinanceRoute).toHaveBeenCalledWith('categoryRules');

    fireEvent.press(screen.getByTestId('profile-finance-accounts-btn'));
    expect(onOpenFinanceRoute).toHaveBeenCalledWith('accounts');

    fireEvent.press(screen.getByTestId('profile-finance-import-btn'));
    expect(onOpenFinanceStatementImport).toHaveBeenCalledTimes(1);
  });

  it('S78-T06: no App, abrir Categorias pelo Perfil navega direto para Categorias e o voltar do Android volta para Mais', async () => {
    const backListeners: Array<() => boolean> = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, cb) => {
      backListeners.push(cb as () => boolean);
      return { remove: jest.fn() };
    });

    await render(<App />);

    // Ir para Finanças e abrir o Perfil pelo avatar
    fireEvent.press(screen.getByTestId('header-globe-button'));
    await waitFor(() => {
      expect(screen.getByTestId('finance-home-screen')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('header-avatar-button'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-backup-screen')).toBeTruthy();
      expect(screen.getByTestId('profile-finance-categories-btn')).toBeTruthy();
    });

    // Tocar em Categorias fecha o Perfil e abre CategoriesScreen
    fireEvent.press(screen.getByTestId('profile-finance-categories-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('settings-backup-screen')).toBeNull();
      expect(screen.getByTestId('categories-screen')).toBeTruthy();
    });

    // Voltar do Android a partir de CategoriesScreen leva para FinanceMoreScreen ('more')
    const lastHandler = backListeners[backListeners.length - 1];
    expect(lastHandler?.()).toBe(true);
    await waitFor(() => {
      expect(screen.getByTestId('finance-more-screen')).toBeTruthy();
    });
  });

  it('S78-T07: no App, atalhos da seção Investimentos (Histórico de proventos) fecham o Perfil e abrem a tela correspondente', async () => {
    await render(<App />);

    fireEvent.press(screen.getByTestId('header-avatar-button'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-backup-screen')).toBeTruthy();
      expect(screen.getByTestId('profile-investments-income-history-btn')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('profile-investments-income-history-btn'));
    await waitFor(() => {
      expect(screen.queryByTestId('settings-backup-screen')).toBeNull();
      expect(screen.getByTestId('income-history-screen')).toBeTruthy();
    });
  });
});
