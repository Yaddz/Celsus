export type PortfolioPaletteId = 'classic' | 'harbor' | 'docks' | 'tribunal';

export interface PortfolioPalette {
  id: PortfolioPaletteId;
  name: string;
  inspiration: string;
  cardBg: string;
  orbSecondary: string;
  accent: string;
  onCard: string;
}

export type ThemeMode = 'dark' | 'light';

export interface ThemeModeColors {
  background: string;
  surface: string;
  surfaceContainer: string;
  onSurface: string;
  muted: string;
}

export interface AssetClassColors {
  FIXED_INCOME: string;
  FII: string;
  STOCK: string;
  CRYPTO: string;
}

export const PORTFOLIO_PALETTE_ORDER: PortfolioPaletteId[] = [
  'classic',
  'harbor',
  'docks',
  'tribunal',
];

export const PORTFOLIO_PALETTES: Record<PortfolioPaletteId, PortfolioPalette> = {
  classic: {
    id: 'classic',
    name: 'Celsus Terracotta',
    inspiration: 'Paleta Original Celsus',
    cardBg: '#D96628',
    orbSecondary: '#2E4A44',
    accent: '#D5CAA8',
    onCard: '#111315',
  },
  harbor: {
    id: 'harbor',
    name: 'Porto & Containers',
    inspiration: 'disco-elysium...a7v6mgkbkec81',
    cardBg: '#DB5A42',
    orbSecondary: '#4A4656',
    accent: '#F1CA78',
    onCard: '#1D1B2A',
  },
  docks: {
    id: 'docks',
    name: 'Luzes das Docas',
    inspiration: 'disco-elysium...lhhbfdkbkec81',
    cardBg: '#EF9F43',
    orbSecondary: '#5B525C',
    accent: '#EDE145',
    onCard: '#1D1B27',
  },
  tribunal: {
    id: 'tribunal',
    name: 'Pátio & Ouro',
    inspiration: 'disco-elysium...z1bl1dkbkec81',
    cardBg: '#F1B819',
    orbSecondary: '#535A49',
    accent: '#AC4B25',
    onCard: '#222526',
  },
};

export const ASSET_CLASS_COLORS: AssetClassColors = {
  FIXED_INCOME: '#2E4A44',
  FII: '#D5CAA8',
  STOCK: '#D96628',
  CRYPTO: '#C49A45',
};

export const THEME_COLORS: Record<ThemeMode, ThemeModeColors> = {
  dark: {
    background: '#111315',
    surface: '#191B1D',
    surfaceContainer: '#202224',
    onSurface: '#E6DECA',
    muted: '#8A8A8E',
  },
  light: {
    background: '#F4F1EA',
    surface: '#FFFFFF',
    surfaceContainer: '#EAE4D7',
    onSurface: '#191B1D',
    muted: '#6E6A63',
  },
};

export { LIGHT_THEME_TOKENS, DARK_THEME_TOKENS } from './tokens';

export function getPortfolioPalette(index: number): PortfolioPalette {
  const normalizedIndex = ((index % PORTFOLIO_PALETTE_ORDER.length) + PORTFOLIO_PALETTE_ORDER.length) % PORTFOLIO_PALETTE_ORDER.length;
  const paletteId = PORTFOLIO_PALETTE_ORDER[normalizedIndex];
  return PORTFOLIO_PALETTES[paletteId];
}

export function getPortfolioPaletteById(id: PortfolioPaletteId): PortfolioPalette {
  const palette = PORTFOLIO_PALETTES[id];
  if (!palette) {
    return PORTFOLIO_PALETTES.classic;
  }
  return palette;
}

export function getThemeColors(mode: ThemeMode): ThemeModeColors {
  return THEME_COLORS[mode] || THEME_COLORS.dark;
}

export class ThemeModeService {
  private currentMode: ThemeMode = 'dark';

  getThemeMode(): ThemeMode {
    return this.currentMode;
  }

  setThemeMode(mode: ThemeMode): ThemeMode {
    this.currentMode = mode;
    return this.currentMode;
  }

  toggleThemeMode(): ThemeMode {
    this.currentMode = this.currentMode === 'dark' ? 'light' : 'dark';
    return this.currentMode;
  }

  reset(): void {
    this.currentMode = 'dark';
  }
}

export const themeModeService = new ThemeModeService();
