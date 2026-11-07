import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QuickActionBentoRow } from '../DirectiveButton';

describe('S9-T03: TestLargerQuickActionsAndDevPlaceholderOnMais', () => {
  describe('Enlarged Bento Buttons (Icons >= 28px and Text >= 15px)', () => {
    it('should render the 3 quick action buttons with enlarged typography and icons in v2 mode', async () => {
      await render(
        <QuickActionBentoRow
          variant="v2"
          testID="quick-actions-v2"
        />
      );

      expect(screen.getByTestId('quick-actions-v2')).toBeDefined();
      expect(screen.getByText(/Aportar/i)).toBeDefined();
      expect(screen.getByText(/Rebalancear/i)).toBeDefined();
      expect(screen.queryByText(/Simular/i)).toBeNull();
      expect(screen.getByText(/Mais/i)).toBeDefined();

      // Verifica tamanho de fonte ampliado (>= 15px e fontWeight '700')
      const aportarText = screen.getByText(/Aportar/i);
      const textStyle = Array.isArray(aportarText.props.style)
        ? Object.assign({}, ...aportarText.props.style.filter(Boolean))
        : aportarText.props.style;
      expect(textStyle.fontSize).toBeGreaterThanOrEqual(15);
      expect(textStyle.fontWeight).toBe('700');

      // Verifica tamanho dos ícones ampliados (>= 28px)
      const aportarIcon = screen.getByTestId('quick-action-icon-north-east');
      expect(aportarIcon.props.size).toBeGreaterThanOrEqual(28);
    });
  });

  describe('Mais Button Interception with Development Notice', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      alertSpy.mockRestore();
    });

    it('should display "Funcionalidade em desenvolvimento" and NOT open options modal when tapping "Mais"', async () => {
      await render(
        <QuickActionBentoRow
          variant="v2"
          testID="quick-actions-v2"
        />
      );

      // Clicar no botão "Mais"
      const maisButton = screen.getByTestId('quick-action-mais');
      fireEvent.press(maisButton);

      // Modal antigo de opções não deve abrir
      expect(screen.queryByTestId('quick-actions-more-modal')).toBeNull();

      // Deve alertar ou exibir que a funcionalidade está em desenvolvimento
      const hasAlert = alertSpy.mock.calls.some((args) =>
        args.some((arg: any) => typeof arg === 'string' && /funcionalidade em desenvolvimento/i.test(arg))
      );
      const hasBanner = screen.queryByTestId('dev-placeholder-banner') !== null ||
        screen.queryByText(/funcionalidade em desenvolvimento/i) !== null;

      expect(hasAlert || hasBanner).toBe(true);
    });
  });
});
