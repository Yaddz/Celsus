import { colors, typography, tokens } from '../tokens';

describe('S2-T01: TestDesignSystemColorAndTypographyTokens', () => {
  describe('Color Tokens Specification', () => {
    it('should have exact primary, secondary, tertiary and neutral hex colors', () => {
      expect(colors.primary.toUpperCase()).toBe('#D96628');
      expect(colors.secondary.toUpperCase()).toBe('#2E4A44');
      expect(colors.tertiary.toUpperCase()).toBe('#D5CAA8');
      expect(colors.neutral.toUpperCase()).toBe('#191B1D');
    });

    it('should have exact void floor / background canvas color', () => {
      expect(colors.voidFloor.toUpperCase()).toBe('#111315');
      expect(colors.background.toUpperCase()).toBe('#111315');
    });

    it('should have exact functional modifier colors', () => {
      expect(colors.parchmentPale.toUpperCase()).toBe('#E6DECA');
      expect(colors.oxidizedSlag.toUpperCase()).toBe('#1B3530');
      expect(colors.deficit.toUpperCase()).toBe('#B84A1C');
    });

    it('should have exact asset class category colors', () => {
      expect(colors.fixedIncome.toUpperCase()).toBe('#2E4A44'); // Renda Fixa
      expect(colors.fii.toUpperCase()).toBe('#D5CAA8');         // FIIs
      expect(colors.stock.toUpperCase()).toBe('#D96628');       // Ações
      expect(colors.crypto.toUpperCase()).toBe('#C49A45');      // Criptomoedas
    });

    it('should export cohesive theme tokens object with colors and typography', () => {
      expect(tokens.colors).toBeDefined();
      expect(tokens.typography).toBeDefined();
      expect(tokens.colors.primary.toUpperCase()).toBe('#D96628');
    });
  });

  describe('Typography Tokens Specification', () => {
    it('should enforce Space Mono as default font family across all variants', () => {
      expect(typography.fontFamily).toBe('Space Mono');
      expect(typography.headlineXl.fontFamily).toBe('Space Mono');
      expect(typography.headlineLg.fontFamily).toBe('Space Mono');
      expect(typography.headlineMd.fontFamily).toBe('Space Mono');
      expect(typography.headlineSm.fontFamily).toBe('Space Mono');
      expect(typography.bodyLg.fontFamily).toBe('Space Mono');
      expect(typography.bodyMd.fontFamily).toBe('Space Mono');
      expect(typography.bodySm.fontFamily).toBe('Space Mono');
      expect(typography.labelLg.fontFamily).toBe('Space Mono');
      expect(typography.labelMd.fontFamily).toBe('Space Mono');
      expect(typography.labelSm.fontFamily).toBe('Space Mono');
    });

    it('should have exact typographic scales and font weights', () => {
      expect(typography.headlineXl.fontSize).toBe(40);
      expect(typography.headlineXl.lineHeight).toBe(48);
      expect(typography.headlineXl.fontWeight).toBe('600');

      expect(typography.headlineLg.fontSize).toBe(32);
      expect(typography.headlineLg.lineHeight).toBe(40);
      expect(typography.headlineLg.fontWeight).toBe('600');

      expect(typography.headlineMd.fontSize).toBe(22);
      expect(typography.headlineMd.lineHeight).toBe(28);
      expect(typography.headlineMd.fontWeight).toBe('500');

      expect(typography.headlineSm.fontSize).toBe(18);
      expect(typography.headlineSm.lineHeight).toBe(24);
      expect(typography.headlineSm.fontWeight).toBe('500');

      expect(typography.bodyLg.fontSize).toBe(18);
      expect(typography.bodyLg.lineHeight).toBe(26);

      expect(typography.bodyMd.fontSize).toBe(15);
      expect(typography.bodyMd.lineHeight).toBe(22);

      expect(typography.bodySm.fontSize).toBe(13);
      expect(typography.bodySm.lineHeight).toBe(18);

      expect(typography.labelLg.fontSize).toBe(14);
      expect(typography.labelLg.lineHeight).toBe(20);
      expect(typography.labelLg.fontWeight).toBe('700');

      expect(typography.labelMd.fontSize).toBe(12);
      expect(typography.labelMd.lineHeight).toBe(16);

      expect(typography.labelSm.fontSize).toBe(10);
      expect(typography.labelSm.lineHeight).toBe(14);
    });
  });
});
