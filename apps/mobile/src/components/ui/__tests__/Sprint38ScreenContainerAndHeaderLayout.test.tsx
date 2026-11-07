import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../../theme/tokens';
import { PortfolioManagementScreen } from '../../../screens/PortfolioManagementScreen';
import App from '../../../../App';
import { resetDatabase } from '../../../db/client';
import { portfolioRepository } from '../../../repositories/portfolioRepository';

// Mock do safe-area-context
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(insets),
    SafeAreaView: ({ children, style, testID }: any) =>
      React.createElement(View, { testID: testID || 'safe-area-view', style }, children),
    useSafeAreaInsets: () => insets,
  };
});

describe('Sprint 38: Layout Inset Standardization (botão de excluir carteira e Home)', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S38-T07: Delete Portfolio Button Full-Width, Height >= 48dp and a11y
  // =========================================================================
  describe('S38-T07: Delete Portfolio Button Geometry and Accessibility', () => {
    it('should style delete-portfolio-btn with full-width (stretch), height >= 48dp and accessible button role', async () => {
      const port = await portfolioRepository.createPortfolio({
        name: 'Carteira para Deletar',
        docket_code: 'DEL-001',
      });

      await render(
        <PortfolioManagementScreen
          initialPortfolios={[port]}
          initialActiveIndex={0}
        />
      );

      const deleteBtn = screen.getByTestId('delete-portfolio-btn');
      expect(deleteBtn).toBeTruthy();

      const flatStyle = StyleSheet.flatten(deleteBtn.props.style);
      expect(flatStyle.alignSelf).toBe('stretch');
      const minHeight = flatStyle.minHeight || flatStyle.height || 0;
      expect(minHeight).toBeGreaterThanOrEqual(48);

      expect(deleteBtn.props.accessibilityRole).toBe('button');
      expect(deleteBtn.props.accessibilityLabel).toMatch(/excluir/i);

      // Tipografia usando token labelMd (tamanho >= 13sp)
      const textNode = screen.getByText(/Excluir Carteira/i);
      const textStyle = StyleSheet.flatten(textNode.props.style);
      expect(textStyle.fontSize).toBeGreaterThanOrEqual(typography.labelMd.fontSize);
    });
  });

  // =========================================================================
  // S38-T08: Home Screen Lateral Inset = 16dp and Header Outside ScrollView
  // =========================================================================
  describe('S38-T08: Home Screen Layout and Header Outside ScrollView', () => {
    it('should render Home header outside ScrollView and content with 16dp lateral inset', async () => {
      await render(<App />);

      // O root da Home
      const homeRoot = screen.getByTestId('home-screen-root');
      expect(homeRoot).toBeTruthy();

      // Header na Home
      const header = screen.getByTestId('xp-minimal-header');
      expect(header).toBeTruthy();

      // O ScrollView da Home
      const scroll = screen.getByTestId('home-scroll-view');
      expect(scroll).toBeTruthy();

      // O ScrollView NÃO deve conter o header como filho direto
      const scrollChildren = Array.isArray(scroll.props.children)
        ? scroll.props.children
        : [scroll.props.children];
      const hasHeaderInScroll = scrollChildren.some(
        (child: any) => child?.props?.testID === 'xp-minimal-header'
      );
      expect(hasHeaderInScroll).toBe(false);

      // Padding lateral do conteúdo deve ser exatamente 16dp (spacing.md)
      const flatScrollStyle = StyleSheet.flatten(scroll.props.contentContainerStyle);
      expect(flatScrollStyle.paddingHorizontal).toBe(spacing.md);
    });
  });
});
