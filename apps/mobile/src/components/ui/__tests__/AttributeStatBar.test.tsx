import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AttributeStatBar, ASSET_CLASS_ATTRIBUTE_MAP } from '../AttributeStatBar';

describe('S2-T02: TestAssetClassToCategoryMapping', () => {
  describe('Asset Class to Real Category Configuration Mapping', () => {
    it('should map FIXED_INCOME to Renda Fixa with teal #2E4A44', () => {
      const config = ASSET_CLASS_ATTRIBUTE_MAP.FIXED_INCOME;
      expect(config.name).toBe('Renda Fixa');
      expect(config.color.toUpperCase()).toBe('#2E4A44');
    });

    it('should map FII to FIIs with parchment #D5CAA8', () => {
      const config = ASSET_CLASS_ATTRIBUTE_MAP.FII;
      expect(config.name).toBe('FIIs');
      expect(config.color.toUpperCase()).toBe('#D5CAA8');
    });

    it('should map STOCK to Ações with amber #D96628', () => {
      const config = ASSET_CLASS_ATTRIBUTE_MAP.STOCK;
      expect(config.name).toBe('Ações');
      expect(config.color.toUpperCase()).toBe('#D96628');
    });

    it('should map CRYPTO to Criptomoedas with ochre #C49A45', () => {
      const config = ASSET_CLASS_ATTRIBUTE_MAP.CRYPTO;
      expect(config.name).toBe('Criptomoedas');
      expect(config.color.toUpperCase()).toBe('#C49A45');
    });
  });

  describe('AttributeStatBar Component UI Rendering', () => {
    it('should render FIXED_INCOME (Renda Fixa) with current vs meta percentages', async () => {
      await render(
        <AttributeStatBar
          assetClass="FIXED_INCOME"
          currentPercentage={32.0}
          targetPercentage={30.0}
          testID="stat-bar-fixed-income"
        />
      );

      expect(screen.getByTestId('stat-bar-fixed-income')).toBeDefined();
      expect(screen.getByText(/RENDA FIXA/i)).toBeDefined();
      expect(screen.getByText(/32(\.0)?%/)).toBeDefined();
      expect(screen.getByText(/30(\.0)?%/)).toBeDefined();
    });

    it('should render FII (FIIs) with current vs meta percentages', async () => {
      await render(
        <AttributeStatBar
          assetClass="FII"
          currentPercentage={24.5}
          targetPercentage={25.0}
          testID="stat-bar-fii"
        />
      );

      expect(screen.getByTestId('stat-bar-fii')).toBeDefined();
      expect(screen.getByText(/FIIS/i)).toBeDefined();
      expect(screen.getByText(/24\.5%/)).toBeDefined();
      expect(screen.getByText(/25(\.0)?%/)).toBeDefined();
    });

    it('should render STOCK (Ações) with current vs meta percentages', async () => {
      await render(
        <AttributeStatBar
          assetClass="STOCK"
          currentPercentage={33.5}
          targetPercentage={35.0}
          testID="stat-bar-stock"
        />
      );

      expect(screen.getByTestId('stat-bar-stock')).toBeDefined();
      expect(screen.getByText(/AÇÕES/i)).toBeDefined();
      expect(screen.getByText(/33\.5%/)).toBeDefined();
      expect(screen.getByText(/35(\.0)?%/)).toBeDefined();
    });

    it('should render CRYPTO (Criptomoedas) with current vs meta percentages', async () => {
      await render(
        <AttributeStatBar
          assetClass="CRYPTO"
          currentPercentage={10.0}
          targetPercentage={10.0}
          testID="stat-bar-crypto"
        />
      );

      expect(screen.getByTestId('stat-bar-crypto')).toBeDefined();
      expect(screen.getByText(/CRIPTOMOEDAS/i)).toBeDefined();
      expect(screen.getByText(/10(\.0)?%/)).toBeDefined();
    });
  });
});
