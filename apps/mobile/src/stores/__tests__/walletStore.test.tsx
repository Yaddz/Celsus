import React from 'react';
import { View, Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import {
  walletStore,
  useActiveWalletIndex,
  useActivePortfolioId,
} from '../walletStore';

describe('Sprint 36: walletStore Reactive Single Source of Truth', () => {
  beforeEach(() => {
    walletStore.reset();
  });

  describe('S36-T01: Central State Management & Listener Notifications', () => {
    it('should set active wallet index and portfolio id and notify subscribers', () => {
      const listener = jest.fn();
      const unsubscribe = walletStore.subscribe(listener);

      expect(walletStore.getState()).toEqual({
        activeWalletIndex: 0,
        activePortfolioId: null,
      });

      walletStore.setActiveIndex(1, 'portfolio-beta');

      expect(walletStore.getState()).toEqual({
        activeWalletIndex: 1,
        activePortfolioId: 'portfolio-beta',
      });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      walletStore.setActiveIndex(2, 'portfolio-gamma');
      expect(listener).toHaveBeenCalledTimes(1); // Not called after unsubscribe
    });
  });

  describe('S36-T02: Reset State Preserves Active Subscribers without Breaking Subscriptions', () => {
    it('should reset state to defaults and notify active subscribers instead of clearing listeners', () => {
      const listener = jest.fn();
      walletStore.subscribe(listener);

      walletStore.setActiveIndex(2, 'portfolio-gamma');
      expect(listener).toHaveBeenCalledTimes(1);

      // Call reset()
      walletStore.reset();

      // State is reset
      expect(walletStore.getState()).toEqual({
        activeWalletIndex: 0,
        activePortfolioId: null,
      });

      // Crucial requirement: reset() must NOT clear listeners, so subsequent updates still notify
      listener.mockClear();
      walletStore.setActiveIndex(1, 'portfolio-alfa');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(walletStore.getState().activePortfolioId).toBe('portfolio-alfa');
    });
  });

  describe('S36-T03: Reactive Hooks (useActiveWalletIndex and useActivePortfolioId)', () => {
    it('should update reactive hook values when walletStore state changes', async () => {
      const TestComponent = () => {
        const index = useActiveWalletIndex();
        const id = useActivePortfolioId();
        return (
          <View>
            <Text testID="active-index">{String(index)}</Text>
            <Text testID="active-id">{id ?? 'null'}</Text>
          </View>
        );
      };

      const { getByTestId } = await render(<TestComponent />);

      expect(getByTestId('active-index').props.children).toBe('0');
      expect(getByTestId('active-id').props.children).toBe('null');

      act(() => {
        walletStore.setActiveIndex(2, 'portfolio-delta');
      });

      expect(getByTestId('active-index').props.children).toBe('2');
      expect(getByTestId('active-id').props.children).toBe('portfolio-delta');
    });
  });
});
