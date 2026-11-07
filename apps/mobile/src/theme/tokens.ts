export interface ColorTokens {
  voidFloor: string;
  background: string;
  neutral: string;
  surfaceContainerLow: string;
  surfaceCard?: string;
  ebonyCard?: string;
  outline?: string;
  primary: string;
  secondary: string;
  secondaryLight?: string;
  secondaryText?: string;
  tertiary: string;
  parchmentPale: string;
  parchmentLight?: string;
  parchmentMuted?: string;
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
  fontFamilyMono: string;
  fontFamilyDisplay: string;
  fontSizeXs: number;
  fontSizeSm: number;
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
  screenHorizontal?: number;
}

export interface BorderTokens {
  radiusSm: number;
  radiusBase: number;
  radiusMd: number;
  radiusLg: number;
  radiusXl: number;
  radiusPill: number;
  radiusFull: number;
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
  surfaceCard: '#191B1D',
  ebonyCard: '#191B1D',
  outline: '#26292C',
  primary: '#D96628',
  secondary: '#2E4A44',
  secondaryLight: '#AECDC5',
  secondaryText: '#9CA3AF',
  tertiary: '#D5CAA8',
  parchmentPale: '#E6DECA',
  parchmentLight: '#E6DECA',
  parchmentMuted: '#B8B2A6',
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
  fontFamilyMono: 'Space Mono',
  fontFamilyDisplay: 'Space Mono',
  fontSizeXs: 10,
  fontSizeSm: 12,
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
  screenHorizontal: 16,
};

/**
 * Escala de espaçamento ÚNICA do app (4/8/12/16/24/32). Nenhuma tela deve usar
 * números soltos para margens/gaps: importe daqui ou use Section/FormField/FormGroup.
 */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Decisões semânticas de layout derivadas da escala. */
export const layout = {
  /** Margem lateral das telas (único valor fora da escala: 20 = spacing.margin). */
  screenPadding: 20,
  /** Margem lateral e respiro superior das telas de aba (Home, Carteiras, Estatísticas). */
  tabScreenPaddingX: spacing.md,
  tabScreenPaddingTop: spacing.xs,
  /** Entre rótulo e campo. */
  labelGap: space.sm,
  /** Entre campos de um mesmo grupo. */
  fieldGap: space.xl,
  /** Entre grupos de campos. */
  groupGap: space.xxl,
  /** Entre seções (separadas por linha fina). */
  sectionGap: space.xxl,
  /** Entre o título da seção e o conteúdo. */
  sectionTitleGap: space.md,
  /** Padding interno de linhas de lista / blocos. */
  rowPadding: space.lg,
  /** Padding interno de blocos que ainda usam superfície (modais, avisos). */
  cardPadding: space.lg,
} as const;

/**
 * Proporções da navbar e do menu "+": a pílula ativa deve envolver ícone+texto com
 * pouca folga. Ajuste aqui, sem tocar nos componentes.
 */
export const dock = {
  iconSize: 22,
  /** Padding horizontal da pílula ativa (folga entre conteúdo e borda). */
  pillPaddingX: 10,
  /** Espaço entre o ícone e o texto da aba ativa. */
  labelGap: 6,
  /** Altura da pílula ativa. */
  pillHeight: 44,
  /** Largura do slot das abas inativas (ícone + folga). */
  inactiveSlotWidth: 44,
  /** Pílulas do menu "+": padding e espaço entre elas. */
  menuPillPaddingX: 14,
  menuPillPaddingY: 10,
  menuPillGap: 10,
} as const;

export const borders: BorderTokens = {
  radiusSm: 6,
  radiusBase: 12,
  radiusMd: 18,
  radiusLg: 22,
  radiusXl: 28,
  radiusPill: 9999,
  radiusFull: 9999,
  hairline: 1,
};

/** Bento Grid: tiles de cantos grandes sobre fundo escuro, com gap curto e uniforme. */
export const bento = {
  gap: 10,
  tileRadius: 28,
  innerRadius: 18,
  tilePadding: 18,
  tileMinHeight: 96,
  variants: {
    primary: { background: '#D96628', foreground: '#1A0E08', muted: 'rgba(26,14,8,0.65)' },
    forest: { background: '#2E4A44', foreground: '#E6DECA', muted: 'rgba(230,222,202,0.7)' },
    cream: { background: '#E6DECA', foreground: '#111315', muted: 'rgba(17,19,21,0.6)' },
    gold: { background: '#D4A83B', foreground: '#1A1405', muted: 'rgba(26,20,5,0.65)' },
    dark: { background: '#1C1E20', foreground: '#E6DECA', muted: '#8A8A8E' },
    light: { background: '#FFFFFF', foreground: '#111315', muted: '#6E6A63' },
  },
} as const;

export type BentoVariant = keyof typeof bento.variants;

export const tokens: ThemeTokens = {
  colors,
  typography,
  spacing,
  borders,
};

export const LIGHT_THEME_TOKENS = {
  backgroundPrimary: '#F4F1EA',
  cardBackground: '#FFFFFF',
  textPrimary: '#111315',
};

export const DARK_THEME_TOKENS = {
  backgroundPrimary: '#111315',
  cardBackground: '#191B1D',
  textPrimary: '#E6DECA',
};

export default tokens;
