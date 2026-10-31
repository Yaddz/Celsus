export interface ColorTokens {
  voidFloor: string;
  background: string;
  neutral: string;
  surfaceContainerLow: string;
  primary: string;
  secondary: string;
  secondaryLight?: string;
  tertiary: string;
  parchmentPale: string;
  parchmentLight?: string;
  subtleText?: string;
  oxidizedSlag: string;
  deficit: string;
  fixedIncome: string;
  fii: string;
  stock: string;
  crypto: string;
}

export interface TypographyVariant {
  fontFamily: string;
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  lineHeight: number;
  letterSpacing?: number;
}

export interface TypographyTokens {
  fontFamily: string;
  sizes: {
    title: number;
    subtitle: number;
    body: number;
    caption: number;
    [key: string]: number;
  };
  weights: {
    regular: '400';
    medium: '500';
    semibold: '600';
    bold: '700';
    [key: string]: any;
  };
  headlineXl: TypographyVariant;
  headlineLg: TypographyVariant;
  headlineMd: TypographyVariant;
  headlineSm: TypographyVariant;
  bodyLg: TypographyVariant;
  bodyMd: TypographyVariant;
  bodySm: TypographyVariant;
  labelLg: TypographyVariant;
  labelMd: TypographyVariant;
  labelSm: TypographyVariant;
}

export interface SpacingTokens {
  gutter: number;
  margin: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
}

export interface BorderTokens {
  radiusSm: number;
  radiusBase: number;
  radiusMd: number;
  radiusLg: number;
  radiusXl: number;
  radiusPill: number;
  hairline: number;
}

export interface ThemeTokens {
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  borders: BorderTokens;
}

export const colors: ColorTokens = {
  voidFloor: '#111315',
  background: '#111315',
  neutral: '#191B1D',
  surfaceContainerLow: '#1A1C1E',
  primary: '#D96628',
  secondary: '#2E4A44',
  secondaryLight: '#AECDC5',
  tertiary: '#D5CAA8',
  parchmentPale: '#E6DECA',
  parchmentLight: '#E6DECA',
  subtleText: '#8A8A8E',
  oxidizedSlag: '#1B3530',
  deficit: '#B84A1C',
  fixedIncome: '#2E4A44',
  fii: '#D5CAA8',
  stock: '#D96628',
  crypto: '#C49A45',
};

export const typography: TypographyTokens = {
  fontFamily: 'Space Mono',
  sizes: {
    title: 15,
    subtitle: 11,
    body: 13,
    caption: 10,
  },
  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  headlineXl: {
    fontFamily: 'Space Mono',
    fontSize: 40,
    fontWeight: '600',
    lineHeight: 48,
    letterSpacing: -0.02,
  },
  headlineLg: {
    fontFamily: 'Space Mono',
    fontSize: 32,
    fontWeight: '600',
    lineHeight: 40,
    letterSpacing: -0.01,
  },
  headlineMd: {
    fontFamily: 'Space Mono',
    fontSize: 22,
    fontWeight: '500',
    lineHeight: 28,
  },
  headlineSm: {
    fontFamily: 'Space Mono',
    fontSize: 18,
    fontWeight: '500',
    lineHeight: 24,
  },
  bodyLg: {
    fontFamily: 'Space Mono',
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 26,
  },
  bodyMd: {
    fontFamily: 'Space Mono',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22,
  },
  bodySm: {
    fontFamily: 'Space Mono',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  labelLg: {
    fontFamily: 'Space Mono',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    letterSpacing: 0.06,
  },
  labelMd: {
    fontFamily: 'Space Mono',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: 0.04,
  },
  labelSm: {
    fontFamily: 'Space Mono',
    fontSize: 10,
    fontWeight: '400',
    lineHeight: 14,
    letterSpacing: 0.08,
  },
};

export const spacing: SpacingTokens = {
  gutter: 12,
  margin: 20,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borders: BorderTokens = {
  radiusSm: 6,
  radiusBase: 12,
  radiusMd: 18,
  radiusLg: 22,
  radiusXl: 28,
  radiusPill: 9999,
  hairline: 1,
};

export const tokens: ThemeTokens = {
  colors,
  typography,
  spacing,
  borders,
};

export default tokens;
