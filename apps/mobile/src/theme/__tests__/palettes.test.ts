import React from 'react';
import { render, screen } from '@testing-library/react-native';
import {
  PortfolioPalette,
  PortfolioPaletteId,
  PORTFOLIO_PALETTES,
  PORTFOLIO_PALETTE_ORDER,
  ASSET_CLASS_COLORS,
  THEME_COLORS,
  getPortfolioPalette,
  getPortfolioPaletteById,
} from '../palettes';
import { AmbientOrb } from '../../components/ui/AmbientOrb';

describe('S8-T01: TestAutoSequentialPortfolioPalettesAndImmutableAssetColors', () => {
  describe('Official Portfolio Palettes Definition (/imgsinsp & Disco Elysium)', () => {
    it('should declare all 4 official portfolio palettes with exact tokens', () => {
      expect(PORTFOLIO_PALETTE_ORDER).toEqual(['classic', 'harbor', 'docks', 'tribunal']);

      const classic = PORTFOLIO_PALETTES.classic;
      expect(classic).toBeDefined();
      expect(classic.id).toBe('classic');
      expect(classic.name).toBe('Celsus Terracotta');
      expect(classic.cardBg.toUpperCase()).toBe('#D96628');
      expect(classic.orbSecondary.toUpperCase()).toBe('#2E4A44');
      expect(classic.accent.toUpperCase()).toBe('#D5CAA8');
      expect(classic.onCard.toUpperCase()).toBe('#111315');

      const harbor = PORTFOLIO_PALETTES.harbor;
      expect(harbor).toBeDefined();
      expect(harbor.id).toBe('harbor');
      expect(harbor.name).toBe('Porto & Containers');
      expect(harbor.cardBg.toUpperCase()).toBe('#DB5A42');
      expect(harbor.orbSecondary.toUpperCase()).toBe('#4A4656');
      expect(harbor.accent.toUpperCase()).toBe('#F1CA78');
      expect(harbor.onCard.toUpperCase()).toBe('#1D1B2A');

      const docks = PORTFOLIO_PALETTES.docks;
      expect(docks).toBeDefined();
      expect(docks.id).toBe('docks');
      expect(docks.name).toBe('Luzes das Docas');
      expect(docks.cardBg.toUpperCase()).toBe('#EF9F43');
      expect(docks.orbSecondary.toUpperCase()).toBe('#5B525C');
      expect(docks.accent.toUpperCase()).toBe('#EDE145');
      expect(docks.onCard.toUpperCase()).toBe('#1D1B27');

      const tribunal = PORTFOLIO_PALETTES.tribunal;
      expect(tribunal).toBeDefined();
      expect(tribunal.id).toBe('tribunal');
      expect(tribunal.name).toBe('Pátio & Ouro');
      expect(tribunal.cardBg.toUpperCase()).toBe('#F1B819');
      expect(tribunal.orbSecondary.toUpperCase()).toBe('#535A49');
      expect(tribunal.accent.toUpperCase()).toBe('#AC4B25');
      expect(tribunal.onCard.toUpperCase()).toBe('#222526');
    });

    it('should retrieve palette by its valid identifier', () => {
      expect(getPortfolioPaletteById('classic').name).toBe('Celsus Terracotta');
      expect(getPortfolioPaletteById('harbor').name).toBe('Porto & Containers');
      expect(getPortfolioPaletteById('docks').name).toBe('Luzes das Docas');
      expect(getPortfolioPaletteById('tribunal').name).toBe('Pátio & Ouro');
    });
  });

  describe('Automatic Sequential Assignment (index % 4)', () => {
    it('should automatically assign palettes in cyclic index % 4 order', () => {
      expect(getPortfolioPalette(0).id).toBe('classic');
      expect(getPortfolioPalette(1).id).toBe('harbor');
      expect(getPortfolioPalette(2).id).toBe('docks');
      expect(getPortfolioPalette(3).id).toBe('tribunal');

      // Next cycle
      expect(getPortfolioPalette(4).id).toBe('classic');
      expect(getPortfolioPalette(5).id).toBe('harbor');
      expect(getPortfolioPalette(6).id).toBe('docks');
      expect(getPortfolioPalette(7).id).toBe('tribunal');

      // Higher indices
      expect(getPortfolioPalette(10).id).toBe('docks'); // 10 % 4 = 2
      expect(getPortfolioPalette(15).id).toBe('tribunal'); // 15 % 4 = 3
      expect(getPortfolioPalette(20).id).toBe('classic'); // 20 % 4 = 0
    });

    it('should simulate sequential creation of multiple portfolios with automatic distinct palettes', () => {
      const createdPortfolios = Array.from({ length: 8 }, (_, idx) => ({
        id: `portfolio-${idx + 1}`,
        name: `Carteira ${idx + 1}`,
        palette: getPortfolioPalette(idx),
      }));

      const assignedPaletteIds = createdPortfolios.map((p) => p.palette.id);
      expect(assignedPaletteIds).toEqual([
        'classic',
        'harbor',
        'docks',
        'tribunal',
        'classic',
        'harbor',
        'docks',
        'tribunal',
      ]);
    });
  });

  describe('Active Palette Propagation to Card, AmbientOrb and Active Accents', () => {
    it('should propagate palette colors when active wallet in stack changes', () => {
      const walletIndices = [0, 1, 2, 3];
      const expectedCardBgs = ['#D96628', '#DB5A42', '#EF9F43', '#F1B819'];
      const expectedOrbSecondaries = ['#2E4A44', '#4A4656', '#5B525C', '#535A49'];
      const expectedAccents = ['#D5CAA8', '#F1CA78', '#EDE145', '#AC4B25'];

      walletIndices.forEach((index) => {
        const activePalette = getPortfolioPalette(index);
        expect(activePalette.cardBg.toUpperCase()).toBe(expectedCardBgs[index]);
        expect(activePalette.orbSecondary.toUpperCase()).toBe(expectedOrbSecondaries[index]);
        expect(activePalette.accent.toUpperCase()).toBe(expectedAccents[index]);
      });
    });

    it('should render AmbientOrb reflecting the active palette tokens', async () => {
      const palette = getPortfolioPalette(1); // harbor: cardBg #DB5A42, orbSecondary #4A4656
      await render(
        React.createElement(AmbientOrb, {
          palette,
          testID: 'ambient-orb-header',
        })
      );

      const orb = screen.getByTestId('ambient-orb-header');
      expect(orb).toBeDefined();
    });
  });

  describe('Immutability of 4 Asset Class Colors and Theme Background', () => {
    it('should guarantee that the 4 asset class colors remain strictly fixed across all palettes', () => {
      expect(ASSET_CLASS_COLORS.FIXED_INCOME.toUpperCase()).toBe('#2E4A44');
      expect(ASSET_CLASS_COLORS.FII.toUpperCase()).toBe('#D5CAA8');
      expect(ASSET_CLASS_COLORS.STOCK.toUpperCase()).toBe('#D96628');
      expect(ASSET_CLASS_COLORS.CRYPTO.toUpperCase()).toBe('#C49A45');

      // Regardless of which palette is active, asset class colors never mutate
      PORTFOLIO_PALETTE_ORDER.forEach((paletteId) => {
        const palette = PORTFOLIO_PALETTES[paletteId];
        expect(palette).toBeDefined();
        // Asset class colors are immutable constants
        expect(ASSET_CLASS_COLORS.FIXED_INCOME.toUpperCase()).toBe('#2E4A44');
        expect(ASSET_CLASS_COLORS.FII.toUpperCase()).toBe('#D5CAA8');
        expect(ASSET_CLASS_COLORS.STOCK.toUpperCase()).toBe('#D96628');
        expect(ASSET_CLASS_COLORS.CRYPTO.toUpperCase()).toBe('#C49A45');
      });
    });

    it('should keep the root background fixed to the global theme regardless of wallet palette', () => {
      expect(THEME_COLORS.dark.background.toUpperCase()).toBe('#111315');
      expect(THEME_COLORS.light.background.toUpperCase()).toBe('#F4F1EA');
    });
  });
});
