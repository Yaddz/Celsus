import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { View, Text, StyleSheet } from 'react-native';
import { ScreenContainer } from '../ScreenContainer';
import { AppHeader } from '../AppHeader';
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

describe('Sprint 38: ScreenContainer, AppHeader & Layout Inset Standardization', () => {
  beforeEach(async () => {
    resetDatabase();
    jest.clearAllMocks();
  });

  // =========================================================================
  // S38-T01: ScreenContainer Layout, Scroll & Horizontal Inset
  // =========================================================================
  describe('S38-T01: ScreenContainer Layout & Lateral Inset', () => {
    it('should render header slot outside ScrollView and scrollContent with 16dp lateral padding', async () => {
      await render(
        <ScreenContainer
          header={<View testID="test-header-slot" />}
          testID="custom-screen-container"
        >
          <Text testID="test-child-content">Conteúdo da tela</Text>
        </ScreenContainer>
      );

      const container = screen.getByTestId('custom-screen-container');
      expect(container).toBeTruthy();

      const headerSlot = screen.getByTestId('test-header-slot');
      expect(headerSlot).toBeTruthy();

      const scrollNode = screen.getByTestId('screen-container-scroll');
      expect(scrollNode).toBeTruthy();

      const scrollContentStyle = StyleSheet.flatten(scrollNode.props.contentContainerStyle);
      expect(scrollContentStyle.paddingHorizontal).toBe(spacing.md); // 16dp (Decisão Q4)
    });

    it('should support static mode without ScrollView when scroll=false with 16dp lateral padding', async () => {
      await render(
        <ScreenContainer scroll={false} testID="static-screen-container">
          <Text testID="static-child">Conteúdo estático</Text>
        </ScreenContainer>
      );

      expect(screen.queryByTestId('screen-container-scroll')).toBeNull();
      const contentNode = screen.getByTestId('screen-container-static-content');
      expect(contentNode).toBeTruthy();

      const flatStyle = StyleSheet.flatten(contentNode.props.style);
      expect(flatStyle.paddingHorizontal).toBe(spacing.md); // 16dp
    });
  });

  // =========================================================================
  // S38-T02: ScreenContainer Footer Slot & Bottom Dock Inset
  // =========================================================================
  describe('S38-T02: ScreenContainer Footer Slot and Dock Spacing', () => {
    it('should render footer slot outside ScrollView and add dock bottom inset when hasBottomDock is true', async () => {
      await render(
        <ScreenContainer
          footer={<View testID="test-footer-dock" />}
          hasBottomDock={true}
        >
          <Text>Texto com dock</Text>
        </ScreenContainer>
      );

      const footerNode = screen.getByTestId('test-footer-dock');
      expect(footerNode).toBeTruthy();

      const scrollNode = screen.getByTestId('screen-container-scroll');
      const flatStyle = StyleSheet.flatten(scrollNode.props.contentContainerStyle);
      expect(flatStyle.paddingBottom).toBeGreaterThanOrEqual(96);
    });
  });

  // =========================================================================
  // S38-T03: ScreenContainer Theme Background Colors
  // =========================================================================
  describe('S38-T03: ScreenContainer Theme Background Colors', () => {
    it('should apply voidFloor background for dark theme and #F4F1EA for light theme', async () => {
      const { rerender } = await render(
        <ScreenContainer themeMode="dark" testID="themed-container">
          <Text>Dark</Text>
        </ScreenContainer>
      );

      let container = screen.getByTestId('themed-container');
      let flatStyle = StyleSheet.flatten(container.props.style);
      expect(flatStyle.backgroundColor).toBe(colors.voidFloor);

      await rerender(
        <ScreenContainer themeMode="light" testID="themed-container">
          <Text>Light</Text>
        </ScreenContainer>
      );

      container = screen.getByTestId('themed-container');
      flatStyle = StyleSheet.flatten(container.props.style);
      expect(flatStyle.backgroundColor).toBe('#F4F1EA');
    });
  });

  // =========================================================================
  // S38-T04: AppHeader Variant "home"
  // =========================================================================
  describe('S38-T04: AppHeader Variant "home"', () => {
    it('should render avatar button, privacy button and globe button, without back button', async () => {
      const onAvatarPress = jest.fn();
      const onTogglePrivacy = jest.fn();
      const onGlobePress = jest.fn();

      await render(
        <AppHeader
          variant="home"
          userName="Pedro"
          userInitials="PL"
          isPrivacyModeEnabled={false}
          onAvatarPress={onAvatarPress}
          onTogglePrivacy={onTogglePrivacy}
          onGlobePress={onGlobePress}
        />
      );

      expect(screen.getByTestId('header-avatar-button')).toBeTruthy();
      expect(screen.getByText('Pedro')).toBeTruthy();
      expect(screen.getByText('PL')).toBeTruthy();

      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
      expect(screen.getByTestId('header-globe-button')).toBeTruthy();
      expect(screen.queryByTestId('header-back-button')).toBeNull();

      fireEvent.press(screen.getByTestId('header-avatar-button'));
      expect(onAvatarPress).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // S38-T05: AppHeader Variant "title"
  // =========================================================================
  describe('S38-T05: AppHeader Variant "title"', () => {
    it('should render screen title without back button and without avatar', async () => {
      await render(
        <AppHeader
          variant="title"
          title="Análises"
          isPrivacyModeEnabled={false}
        />
      );

      expect(screen.getByText('Análises')).toBeTruthy();
      expect(screen.queryByTestId('header-back-button')).toBeNull();
      expect(screen.queryByTestId('header-avatar-button')).toBeNull();
      expect(screen.getByTestId('header-privacy-button')).toBeTruthy();
    });
  });

  // =========================================================================
  // S38-T06: AppHeader Variant "back"
  // =========================================================================
  describe('S38-T06: AppHeader Variant "back"', () => {
    it('should render back button and trigger onBack with title', async () => {
      const onBack = jest.fn();

      await render(
        <AppHeader
          variant="back"
          title="Carteiras"
          subtitle="Gerenciamento de Ativos"
          onBack={onBack}
        />
      );

      const backBtn = screen.getByTestId('header-back-button');
      expect(backBtn).toBeTruthy();
      expect(screen.getByText('Carteiras')).toBeTruthy();
      expect(screen.getByText('Gerenciamento de Ativos')).toBeTruthy();

      fireEvent.press(backBtn);
      expect(onBack).toHaveBeenCalledTimes(1);
    });
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
