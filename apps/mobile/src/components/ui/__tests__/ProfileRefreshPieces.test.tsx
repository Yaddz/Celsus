import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { DangerConfirmSheet } from '../DangerConfirmSheet';
import { SegmentedControl } from '../SegmentedControl';
import { ThemeModeService } from '../../../theme/palettes';
import { resolveBackAction } from '../../../navigation/backNavigation';
import { ProfileNameRow } from '../../../screens/profile/ProfileTiles';
import { act } from '@testing-library/react-native';

describe('Peças do Perfil e da tela de bloqueio', () => {
  it('DangerConfirmSheet só libera a confirmação com a palavra exata', async () => {
    const onConfirm = jest.fn();
    await render(
      <DangerConfirmSheet visible onClose={jest.fn()} onConfirm={onConfirm} title="Apagar?" message="Tudo some." />
    );
    const btn = screen.getByTestId('danger-confirm-btn');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('danger-confirm-input'), 'apagar');
    expect(btn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByTestId('danger-confirm-input'), 'APAGAR');
    expect(btn.props.accessibilityState?.disabled).toBe(false);
    fireEvent.press(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('SegmentedControl marca a opção ativa e avisa a troca', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl
        value={60}
        onChange={onChange}
        options={[
          { id: 30, label: '30 s', testID: 'seg-30' },
          { id: 60, label: '1 min', testID: 'seg-60' },
        ]}
      />
    );
    expect(screen.getByTestId('seg-60').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('seg-30').props.accessibilityState?.selected).toBe(false);
    fireEvent.press(screen.getByTestId('seg-30'));
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('ThemeModeService avisa os inscritos (a tela de bloqueio segue o tema do app)', () => {
    const service = new ThemeModeService();
    const seen: string[] = [];
    const unsubscribe = service.subscribe((m) => seen.push(m));
    service.setThemeMode('light');
    service.toggleThemeMode();
    unsubscribe();
    service.setThemeMode('light');
    expect(seen).toEqual(['light', 'dark']);
  });

  it('voltar do Android na importação B3 aberta pelo Perfil retorna ao Perfil', () => {
    expect(
      resolveBackAction({
        activeTab: 'home',
        isSettingsOpen: true,
        isB3ImportOpen: true,
        isTransactionDetailOpen: false,
        isAllTransactionsOpen: false,
        isClassDetailOpen: false,
        isTransactionModalOpen: false,
        isPortfolioManagerOpen: false,
        isSimulatorOpen: false,
      })
    ).toBe('close-b3-import');
  });

  it('o nome do perfil salva sozinho ao parar de digitar, sem depender de sair do campo', async () => {
    jest.useFakeTimers();
    const repo: any = {
      getProfile: jest.fn().mockResolvedValue({ name: '', initials: '', onboarded: true }),
      setProfileName: jest.fn().mockResolvedValue(undefined),
    };
    await render(<ProfileNameRow isLight={false} profileRepository={repo} first />);
    fireEvent.press(screen.getByTestId('security-name-row'));
    fireEvent.changeText(screen.getByTestId('security-name-input'), 'Pedro Lima');
    expect(repo.setProfileName).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(repo.setProfileName).toHaveBeenCalledWith('Pedro Lima');
    jest.useRealTimers();
  });
});
