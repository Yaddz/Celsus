import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MODULE_META } from '../../../navigation/appModule';
import { XpMinimalHeader } from '../XpMinimalHeader';

describe('Sprint 76 — XpMinimalHeader com ícone de módulo (Fase A)', () => {
  test('S76-T01: mostra show-chart em investments e account-balance em finance, com accessibilityLabel para o outro módulo', async () => {
    const onSwitch = jest.fn();
    await render(
      <XpMinimalHeader
        module="investments"
        onSwitchModule={onSwitch}
        userName="Pedro"
        userInitials="PL"
      />
    );

    const iconInv = screen.getByTestId('header-globe-icon');
    expect(iconInv.props.name).toBe('show-chart');
    expect(MODULE_META.investments.icon).toBe('show-chart');
    expect(screen.getByTestId('header-globe-button').props.accessibilityLabel).toBe(
      'Alternar para Finanças'
    );

    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onSwitch).toHaveBeenCalledTimes(1);

    await render(
      <XpMinimalHeader
        module="finance"
        onSwitchModule={onSwitch}
        userName="Pedro"
        userInitials="PL"
      />
    );
    const iconFin = screen.getByTestId('header-globe-icon');
    expect(iconFin.props.name).toBe('account-balance');
    expect(MODULE_META.finance.icon).toBe('account-balance');
    expect(screen.getByTestId('header-globe-button').props.accessibilityLabel).toBe(
      'Alternar para Investimentos'
    );
  });

  test('S76-T02: sem onSwitchModule/onGlobePress não desenha o botão nem dispara Alert; mantém compatibilidade com onGlobePress', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<XpMinimalHeader title="Detalhe" onBack={jest.fn()} />);

    expect(screen.queryByTestId('header-globe-button')).toBeNull();
    expect(alertSpy).not.toHaveBeenCalled();

    const onGlobe = jest.fn();
    await render(
      <XpMinimalHeader
        userName="Pedro"
        onGlobePress={onGlobe}
        isGlobeActive={true}
      />
    );
    fireEvent.press(screen.getByTestId('header-globe-button'));
    expect(onGlobe).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('header-globe-icon').props.name).toBe('account-balance');
    alertSpy.mockRestore();
  });
});
