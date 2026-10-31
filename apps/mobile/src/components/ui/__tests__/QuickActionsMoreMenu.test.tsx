import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QuickActionBentoRow } from '../DirectiveButton';

describe('S9-T03: TestLargerQuickActionsAndMoreTwoOptionsMenu', () => {
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
      expect(screen.getByText(/Simular/i)).toBeDefined();
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

  describe('Modal / Sheet Trigger on "Mais" with 2 Options', () => {
    it('should open the options modal when tapping "Mais" button', async () => {
      const onNovoAporte = jest.fn();
      const onNovaCarteira = jest.fn();

      await render(
        <QuickActionBentoRow
          variant="v2"
          onNovoAportePress={onNovoAporte}
          onNovaCarteiraPress={onNovaCarteira}
          testID="quick-actions-v2"
        />
      );

      // Inicialmente o modal com opções está fechado
      expect(screen.queryByTestId('quick-actions-more-modal')).toBeNull();

      // Clicar no botão "Mais"
      const maisButton = screen.getByTestId('quick-action-mais');
      fireEvent.press(maisButton);

      // Agora o modal com as 2 opções deve estar visível
      expect(screen.getByTestId('quick-actions-more-modal')).toBeDefined();
      expect(screen.getByTestId('more-option-novo-aporte')).toBeDefined();
      expect(screen.getByTestId('more-option-nova-carteira')).toBeDefined();
      expect(screen.getByText(/Novo Aporte/i)).toBeDefined();
      expect(screen.getByText(/Nova Carteira/i)).toBeDefined();
    });

    it('should trigger onNovoAportePress and close modal when selecting "Novo Aporte"', async () => {
      const onNovoAporte = jest.fn();

      await render(
        <QuickActionBentoRow
          variant="v2"
          onNovoAportePress={onNovoAporte}
          testID="quick-actions-v2"
        />
      );

      // Abre o modal
      fireEvent.press(screen.getByTestId('quick-action-mais'));

      // Toca em "Novo Aporte"
      const novoAporteBtn = screen.getByTestId('more-option-novo-aporte');
      fireEvent.press(novoAporteBtn);

      expect(onNovoAporte).toHaveBeenCalledTimes(1);
      // O modal fecha após a seleção
      expect(screen.queryByTestId('quick-actions-more-modal')).toBeNull();
    });

    it('should trigger onNovaCarteiraPress and close modal when selecting "Nova Carteira"', async () => {
      const onNovaCarteira = jest.fn();

      await render(
        <QuickActionBentoRow
          variant="v2"
          onNovaCarteiraPress={onNovaCarteira}
          testID="quick-actions-v2"
        />
      );

      // Abre o modal
      fireEvent.press(screen.getByTestId('quick-action-mais'));

      // Toca em "Nova Carteira"
      const novaCarteiraBtn = screen.getByTestId('more-option-nova-carteira');
      fireEvent.press(novaCarteiraBtn);

      expect(onNovaCarteira).toHaveBeenCalledTimes(1);
      // O modal fecha após a seleção
      expect(screen.queryByTestId('quick-actions-more-modal')).toBeNull();
    });
  });
});
