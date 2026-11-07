import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PinKeypad } from '../PinKeypad';

describe('S43: PinKeypad Component Tests', () => {
  it('S43-T04: should render 3x4 grid with keys 0-9 and backspace with accessibility labels', async () => {
    const onDigit = jest.fn();
    const onBackspace = jest.fn();

    const { getByTestId } = await render(
      <PinKeypad onDigit={onDigit} onBackspace={onBackspace} />
    );

    for (let i = 0; i <= 9; i++) {
      const key = getByTestId(`pin-key-${i}`);
      expect(key).toBeDefined();
      expect(key.props.accessibilityLabel).toBe(`Dígito ${i}`);
    }
    expect(getByTestId('pin-key-backspace')).toBeDefined();
  });

  it('S43-T05: should fire onDigit with the pressed digit value', async () => {
    const onDigit = jest.fn();
    const onBackspace = jest.fn();

    const { getByTestId } = await render(
      <PinKeypad onDigit={onDigit} onBackspace={onBackspace} />
    );

    fireEvent.press(getByTestId('pin-key-1'));
    expect(onDigit).toHaveBeenCalledWith('1');

    fireEvent.press(getByTestId('pin-key-9'));
    expect(onDigit).toHaveBeenCalledWith('9');

    fireEvent.press(getByTestId('pin-key-0'));
    expect(onDigit).toHaveBeenCalledWith('0');
  });

  it('S43-T06: should handle backspace press and long-press (clear all)', async () => {
    const onBackspace = jest.fn();
    const onBackspaceLongPress = jest.fn();

    const { getByTestId } = await render(
      <PinKeypad
        onDigit={jest.fn()}
        onBackspace={onBackspace}
        onBackspaceLongPress={onBackspaceLongPress}
      />
    );

    const backspaceKey = getByTestId('pin-key-backspace');
    fireEvent.press(backspaceKey);
    expect(onBackspace).toHaveBeenCalledTimes(1);

    fireEvent(backspaceKey, 'longPress');
    expect(onBackspaceLongPress).toHaveBeenCalledTimes(1);
  });

  it('S43-T07: biometric key only renders when biometricAvailable is true and fires onBiometric', async () => {
    const onBiometric = jest.fn();

    const { queryByTestId, rerender, getByTestId } = await render(
      <PinKeypad
        onDigit={jest.fn()}
        onBackspace={jest.fn()}
        onBiometric={onBiometric}
        biometricAvailable={false}
      />
    );

    expect(queryByTestId('pin-key-biometric')).toBeNull();

    await rerender(
      <PinKeypad
        onDigit={jest.fn()}
        onBackspace={jest.fn()}
        onBiometric={onBiometric}
        biometricAvailable={true}
      />
    );

    const bioKey = getByTestId('pin-key-biometric');
    expect(bioKey).toBeDefined();
    fireEvent.press(bioKey);
    expect(onBiometric).toHaveBeenCalledTimes(1);
  });

  it('S43-T08: should disable keypad interactions when disabled is true', async () => {
    const onDigit = jest.fn();
    const onBackspace = jest.fn();

    const { getByTestId } = await render(
      <PinKeypad
        onDigit={onDigit}
        onBackspace={onBackspace}
        disabled={true}
      />
    );

    fireEvent.press(getByTestId('pin-key-5'));
    expect(onDigit).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('pin-key-backspace'));
    expect(onBackspace).not.toHaveBeenCalled();
  });
});
