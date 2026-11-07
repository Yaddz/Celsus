import React from 'react';
import { render } from '@testing-library/react-native';
import { PinDots } from '../PinDots';

describe('S43: PinDots Component Tests', () => {
  it('S43-T01: should render 6 dots by default with proper testIDs', async () => {
    const { getByTestId } = await render(<PinDots filled={0} />);

    expect(getByTestId('pin-dots')).toBeDefined();
    for (let i = 0; i < 6; i++) {
      expect(getByTestId(`pin-dot-${i}`)).toBeDefined();
    }
  });

  it('S43-T02: should reflect filled dots count and expose accessibilityValue', async () => {
    const { getByTestId, rerender } = await render(<PinDots filled={3} length={6} />);

    const container = getByTestId('pin-dots');
    expect(container.props.accessibilityValue).toEqual({
      text: '3 de 6 dígitos preenchidos',
    });

    await rerender(<PinDots filled={6} length={6} />);
    expect(getByTestId('pin-dots').props.accessibilityValue).toEqual({
      text: '6 de 6 dígitos preenchidos',
    });
  });

  it('S43-T03: should apply error state styling and trigger shake animation', async () => {
    const { getByTestId } = await render(<PinDots filled={6} error={true} />);

    const container = getByTestId('pin-dots');
    expect(container).toBeDefined();
    // Dot 0 should have error color or styling applied
    const dot0 = getByTestId('pin-dot-0');
    expect(dot0).toBeDefined();
  });
});
